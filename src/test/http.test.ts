import { before, describe, it } from "node:test";
import assert from "node:assert";
import type { MockPool } from "undici";
import { MockAgent, setGlobalDispatcher } from "undici";
import { createHttpClient } from "../client.ts";

let mockPool: MockPool;
let mockAgent: MockAgent;

before(() => {
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  mockPool = mockAgent.get("http://api.example.com");
  setGlobalDispatcher(mockAgent);
});

describe("HttpClient", () => {
  it("should successfully create an http client", () => {
    const client = createHttpClient();

    assert.ok(client, "Client should be created");
    assert.ok(client.fetch, "Client should have fetch method");
  });

  it("should make successful GET request", async () => {
    const client = createHttpClient();

    const responseBody = { data: "test" };
    mockPool
      .intercept({ path: "/test", method: "GET" })
      .reply(200, responseBody, {
        headers: { "Content-Type": "application/json" },
      });

    const response = await client.get("http://api.example.com/test");
    const data = await response.json();

    assert.equal(response.status, 200, "Status should be 200");
    assert.deepEqual(data, responseBody, "Response body should match");
  });

  it("should handle request headers correctly", async () => {
    const client = createHttpClient({
      headers: {
        "X-Test": "test-header",
      },
    });

    mockPool
      .intercept({
        path: "/test",
        method: "GET",
        headers: {
          "X-Test": "test-header",
        },
      })
      .reply(200, { data: "test" });

    const response = await client.get("http://api.example.com/test");
    assert.equal(response.status, 200, "Status should be 200");
  });

  it("should retry on configured status codes", async () => {
    const client = createHttpClient({
      retry: {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 100,
      },
    });

    let attempts = 0;
    mockPool
      .intercept({ path: "/test", method: "GET" })
      .reply(() => {
        attempts++;
        return attempts < 2
          ? { statusCode: 503 }
          : { statusCode: 200, data: { success: true } };
      })
      .times(2);

    const response = await client.get("http://api.example.com/test");
    assert.equal(response.status, 200, "Final status should be 200");
    assert.equal(attempts, 2, "Should have attempted twice");
  });

  it("should emit events for request lifecycle", async () => {
    const client = createHttpClient({});

    const events: string[] = [];
    client.on("request:start", () => events.push("start"));
    client.on("request:end", () => events.push("end"));

    mockPool
      .intercept({ path: "/test", method: "GET" })
      .reply(200, { data: "test" });

    await client.get("http://api.example.com/test");

    assert.deepEqual(
      events,
      ["start", "end"],
      "Should emit start and end events",
    );
  });

  it("should handle request timeout", async () => {
    const client = createHttpClient({
      timeout: 50, // Very short timeout
    });

    // Mock a delayed response that takes longer than the timeout
    mockPool
      .intercept({ path: "/test", method: "GET" })
      .reply(200, { data: "test" })
      .delay(100);

    await assert.rejects(
      async () => {
        await client.get("http://api.example.com/test");
      },
      (error: Error) => {
        assert.ok(
          error.name === "AbortError",
          "Should throw AbortError on timeout",
        );
        return true;
      },
    );
  });

  it("should handle different HTTP methods", async () => {
    const client = createHttpClient({});

    const testBody = { test: "data" };

    mockPool
      .intercept({
        path: "/test",
        method: "POST",
        body: JSON.stringify(testBody),
      })
      .reply(201, { created: true });

    mockPool
      .intercept({
        path: "/test/1",
        method: "PUT",
        body: JSON.stringify(testBody),
      })
      .reply(200, { updated: true });

    mockPool.intercept({ path: "/test/1", method: "DELETE" }).reply(204);

    const postResponse = await client.post("http://api.example.com/test", {
      body: JSON.stringify(testBody),
    });
    assert.equal(postResponse.status, 201, "POST should return 201");

    const putResponse = await client.put("http://api.example.com/test/1", {
      body: JSON.stringify(testBody),
    });
    assert.equal(putResponse.status, 200, "PUT should return 200");

    const deleteResponse = await client.delete("http://api.example.com/test/1");
    assert.equal(deleteResponse.status, 204, "DELETE should return 204");
  });
});
