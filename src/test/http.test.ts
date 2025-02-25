import { before, describe, it } from "node:test";
import assert from "node:assert";
import type { MockPool } from "undici";
import { MockAgent, setGlobalDispatcher } from "undici";
import { createHttpClient } from "../client.ts";
import { HttpError } from "../errors.ts";

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
  it("should use custom shouldRetry function to retry based on error message", async () => {
    const client = createHttpClient({
      retry: {
        maxRetries: 3,
        initialDelay: 10,
        maxDelay: 100,
        retryableStatuses: [503],
        shouldRetry: (error) => error.responseContains("Service Unavailable"),
      },
    });

    mockPool
      .intercept({ path: "/custom-retry", method: "GET" })
      .reply(503, () => {
        return {
          statusCode: 503,
          data: { error: "Service Unavailable" },
        };
      });

    mockPool
      .intercept({ path: "/custom-retry", method: "GET" })
      .reply(500, () => {
        return { statusCode: 500, data: { error: "internal server error" } };
      });

    mockPool
      .intercept({ path: "/custom-retry", method: "GET" })
      .reply(200, () => {
        return { statusCode: 200, data: { success: true } };
      });

    let retryAttempts = 0;

    client.on("request:retry", (_url, _err, retries) => {
      retryAttempts = retries;
    });

    // This should retry on the first 503 error (service unavailable)
    // but not on the second 500 error (internal server error)
    await assert.rejects(
      async () => {
        await client.get("http://api.example.com/custom-retry");
      },
      () => {
        // Should fail with the 500 error
        assert.equal(retryAttempts, 1, "Should have one retry (called twice)");
        return true;
      },
    );
  });

  it("should use custom shouldRetry function to limit retries based on attempt count", async () => {
    const client = createHttpClient({
      retry: {
        maxRetries: 5, // Set high max retries
        initialDelay: 10,
        maxDelay: 100,
        // Only retry on first attempt
        shouldRetry: (_, attempt) => attempt === 1,
      },
    });

    let attempts = 0;
    mockPool
      .intercept({ path: "/attempt-limit", method: "GET" })
      .reply(() => {
        attempts++;
        return { statusCode: 500, data: { error: "server error" } };
      })
      .persist();

    // This should only retry once despite the 500 error
    await assert.rejects(
      async () => {
        await client.get("http://api.example.com/attempt-limit");
      },
      () => {
        assert.equal(attempts, 2, "Should have attempted exactly twice");
        return true;
      },
    );
  });

  it("should combine retryableStatuses with shouldRetry for custom retry logic", async () => {
    const client = createHttpClient({
      retry: {
        maxRetries: 3,
        initialDelay: 10,
        maxDelay: 100,
        retryableStatuses: [429],
        shouldRetry: (error) => {
          return error.responseContains("rate limit exceeded");
        },
      },
    });

    // Scenario 1: Correct status (429) and correct message ("rate limit exceeded") - should retry
    let rateLimitAttempts = 0;
    mockPool
      .intercept({ path: "/rate-limit", method: "GET" })
      .reply(() => {
        rateLimitAttempts++;
        return {
          statusCode: 429,
          data: { error: "rate limit exceeded" },
        };
      })
      .persist();

    // Scenario 2: Wrong status (503) but correct message - should not retry
    let wrongStatusAttempts = 0;
    mockPool
      .intercept({ path: "/wrong-status", method: "GET" })
      .reply(() => {
        wrongStatusAttempts++;
        return {
          statusCode: 503,
          data: { error: "rate limit exceeded" },
        };
      })
      .persist();

    // Scenario 3: Correct status (429) but wrong message - should not retry
    let wrongMessageAttempts = 0;
    mockPool
      .intercept({ path: "/wrong-message", method: "GET" })
      .reply(() => {
        wrongMessageAttempts++;
        return {
          statusCode: 429,
          data: { error: "server error" },
        };
      })
      .persist();

    // Test scenario 1: Should retry (maxRetries + 1 = 4 attempts)
    await assert.rejects(
      async () => {
        await client.get("http://api.example.com/rate-limit");
      },
      () => true,
    );
    assert.equal(
      rateLimitAttempts,
      4,
      "Should have attempted 4 times for rate-limit scenario",
    );

    // Test scenario 2: Should not retry (only 1 attempt)
    await assert.rejects(
      async () => {
        await client.get("http://api.example.com/wrong-status");
      },
      () => true,
    );
    assert.equal(
      wrongStatusAttempts,
      1,
      "Should have attempted only once for wrong-status scenario",
    );

    // Test scenario 3: Should not retry (only 1 attempt)
    await assert.rejects(
      async () => {
        await client.get("http://api.example.com/wrong-message");
      },
      () => true,
    );
    assert.equal(
      wrongMessageAttempts,
      1,
      "Should have attempted only once for wrong-message scenario",
    );

    // Clean up
    mockPool.removeAllListeners();
  });

  it("should throw HttpError with proper properties", async () => {
    const client = createHttpClient({
      retry: {
        maxRetries: 0, // No retries for this test
      },
    });

    mockPool
      .intercept({ path: "/error-test", method: "GET" })
      .reply(404, { message: "Resource not found" });

    await assert.rejects(
      async () => {
        await client.get("http://api.example.com/error-test");
      },
      (error) => {
        assert.ok(error instanceof HttpError, "Error should be an HttpError");

        const httpError = error as HttpError;
        assert.equal(httpError.status, 404, "Status should be 404");
        assert.equal(
          httpError.url,
          "http://api.example.com/error-test",
          "URL should match",
        );
        assert.ok(httpError.responseBody, "Response body should exist");
        assert.deepEqual(
          httpError.responseBody,
          { message: "Resource not found" },
          "Response body should match",
        );

        // Test helper methods
        assert.ok(
          httpError.hasStatus(404),
          "hasStatus should return true for 404",
        );
        assert.ok(
          httpError.hasStatusInRange(400, 499),
          "hasStatusInRange should return true for 400-499",
        );
        assert.ok(
          httpError.isClientError(),
          "isClientError should return true",
        );
        assert.ok(
          !httpError.isServerError(),
          "isServerError should return false",
        );
        assert.ok(
          httpError.responseContains("not found"),
          "responseContains should find substring",
        );

        return true;
      },
    );
  });
});
