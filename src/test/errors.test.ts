import { describe, it } from "node:test";
import assert from "node:assert";
import { HttpError } from "../errors.ts";

describe("HttpError", () => {
  it("should create an HttpError with the correct properties", () => {
    const error = new HttpError(
      "HTTP 404: Not Found",
      404,
      "https://api.example.com/resource",
      { message: "Resource not found" },
    );

    assert.equal(error.name, "HttpError", "Name should be HttpError");
    assert.equal(error.message, "HTTP 404: Not Found", "Message should match");
    assert.equal(error.status, 404, "Status should be 404");
    assert.equal(
      error.url,
      "https://api.example.com/resource",
      "URL should match",
    );
    assert.deepEqual(
      error.responseBody,
      { message: "Resource not found" },
      "Response body should match",
    );
  });

  it("should correctly identify status codes", () => {
    const error = new HttpError(
      "HTTP 404: Not Found",
      404,
      "https://api.example.com/resource",
    );

    assert.ok(error.hasStatus(404), "hasStatus should return true for 404");
    assert.ok(!error.hasStatus(500), "hasStatus should return false for 500");

    assert.ok(
      error.hasStatusInRange(400, 499),
      "hasStatusInRange should return true for 400-499",
    );
    assert.ok(
      !error.hasStatusInRange(500, 599),
      "hasStatusInRange should return false for 500-599",
    );

    assert.ok(
      error.isClientError(),
      "isClientError should return true for 404",
    );
    assert.ok(
      !error.isServerError(),
      "isServerError should return false for 404",
    );

    const serverError = new HttpError(
      "HTTP 500: Internal Server Error",
      500,
      "https://api.example.com/resource",
    );

    assert.ok(
      serverError.isServerError(),
      "isServerError should return true for 500",
    );
    assert.ok(
      !serverError.isClientError(),
      "isClientError should return false for 500",
    );
  });

  it("should correctly check response body content", () => {
    const error = new HttpError(
      "HTTP 429: Too Many Requests",
      429,
      "https://api.example.com/resource",
      { error: "rate limit exceeded", retryAfter: 30 },
    );

    assert.ok(
      error.responseContains("rate limit"),
      "responseContains should find substring in response body",
    );
    assert.ok(
      error.responseContains("retryAfter"),
      "responseContains should find property names",
    );
    assert.ok(
      !error.responseContains("not present"),
      "responseContains should return false for missing text",
    );
  });

  it("should handle missing response body", () => {
    const error = new HttpError(
      "HTTP 500: Internal Server Error",
      500,
      "https://api.example.com/resource",
    );

    assert.ok(
      !error.responseContains("anything"),
      "responseContains should return false when responseBody is undefined",
    );
  });
});
