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
      timeout: 50,
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
  it("should emit all events for request lifecycle", async () => {
    const client = createHttpClient({
      retry: {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 100,
      },
    });

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

    client.on("request:start", (url) => {
      events.push({ event: "start", data: { url } });
    });

    client.on("request:end", (url, response, duration) => {
      events.push({
        event: "end",
        data: { url, status: response.status, duration },
      });
    });

    client.on("request:error", (url, error) => {
      events.push({ event: "error", data: { url, error: error.message } });
    });

    client.on("request:retry", (url, _, attempt) => {
      events.push({ event: "retry", data: { url, attempt } });
    });

    mockPool.removeAllListeners();

    // Success case - simple 200 response
    mockPool
      .intercept({ path: "/success", method: "GET" })
      .reply(200, { data: "test" });

    // Error case - 500 response that will trigger retries
    mockPool
      .intercept({ path: "/error", method: "GET" })
      .reply(500, { error: "server error" })
      .persist();

    // Retry case - first 503, then 200
    mockPool
      .intercept({ path: "/retry", method: "GET" })
      .reply(503, { error: "service unavailable" })
      .times(1);

    mockPool
      .intercept({ path: "/retry", method: "GET" })
      .reply(200, { data: "success after retry" })
      .times(1);

    // Test successful request
    await client.get("http://api.example.com/success");

    // Test retry request that succeeds on second attempt
    await client.get("http://api.example.com/retry");

    // Verify events for retry scenario
    assert.equal(
      events.length,
      8,
      "Should have emitted 8 events for full success+retry scenario",
    );

    // Check event types and order for retry scenario
    assert.equal(events[0].event, "start", "First event should be start");
    assert.equal(events[1].event, "end", "Second event should be end (200)");
    assert.equal(events[2].event, "start", "Third event should be start");
    assert.equal(events[3].event, "end", "Fourth event should be end (503)");
    assert.equal(events[4].event, "error", "Fifth event should be error");
    assert.equal(events[5].event, "retry", "Sixth event should be retry");
    assert.equal(events[6].event, "start", "Seventh event should be start");
    assert.equal(events[7].event, "end", "Eight event should be end (200)");
    assert.equal(
      events[6].event,
      "start",
      "Seventh event should be start (retry)",
    );
    assert.equal(events[7].event, "end", "Eight event should be end (200)");

    assert.ok(
      (events[1].data.duration as number) >= 0,
      "Duration should be a number",
    );
    assert.equal(
      events[3].data.status,
      503,
      "Fourth response status should be 503",
    );
    assert.equal(events[5].data.attempt, 1, "Retry attempt should be 1");
    assert.equal(
      events[7].data.status,
      200,
      "Final response status should be 200",
    );
  });
});
