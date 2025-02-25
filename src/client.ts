import { EventEmitter } from "events";
import { fetch, type RequestInit, Response } from "undici";
import { HttpError } from "./errors.ts";

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Jitter factor (0-1) to add randomness to delays */
  jitter?: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatuses?: number[];
  /** Custom condition to determine if a request should be retried */
  shouldRetry?: (error: HttpError, attempt: number) => boolean;
}

export interface HttpClientConfig {
  /** Default headers to include in all requests */
  headers?: Record<string, string>;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: RetryConfig;
}
export interface HttpClientEvents {
  "request:start": (url: string, init: RequestInit) => void;
  "request:end": (url: string, response: Response, duration: number) => void;
  "request:error": (
    url: string,
    error: Error | HttpError,
    attempt: number,
  ) => void;
  "request:retry": (url: string, error: HttpError, attempt: number) => void;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 1000,
  jitter: 0.1,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  shouldRetry: () => true,
};

export class HttpClient {
  private config: HttpClientConfig;
  private events: EventEmitter;
  private retryConfig: Required<RetryConfig>;

  constructor(config: HttpClientConfig = {}) {
    this.config = config;
    this.events = new EventEmitter();
    this.retryConfig = { ...DEFAULT_CONFIG, ...config.retry };
  }

  on<K extends keyof HttpClientEvents>(
    event: K,
    listener: HttpClientEvents[K],
  ): void {
    this.events.on(event, listener);
  }

  off<K extends keyof HttpClientEvents>(
    event: K,
    listener: HttpClientEvents[K],
  ): void {
    this.events.off(event, listener);
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    attempt = 1,
  ): Promise<Response> {
    const startTime = Date.now();

    try {
      this.events.emit("request:start", url, init);

      const controller = new AbortController();
      const timeoutId = this.config.timeout
        ? setTimeout(() => controller.abort(), this.config.timeout)
        : null;

      const response = await fetch(url, {
        ...init,
        headers: {
          ...this.config.headers,
          ...init.headers,
        },
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      this.events.emit("request:end", url, response, duration);

      if (!response.ok) {
        // Clone the response to read the body without consuming the original
        const clonedResponse = response.clone();
        let responseBody;

        try {
          responseBody = await clonedResponse.json();
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // If we can't parse the body as JSON, use an empty object
          responseBody = {};
        }

        const httpError = new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          url,
          responseBody,
        );

        throw httpError;
      }

      return response;
    } catch (error) {
      // Don't retry timeout errors (AbortError)
      if (error instanceof Error && error.name === "AbortError") {
        this.events.emit("request:error", url, error, attempt);
        throw error; // Re-throw AbortError directly
      }

      this.events.emit("request:error", url, error as Error, attempt);

      if (
        attempt <= this.retryConfig.maxRetries &&
        error instanceof HttpError
      ) {
        const shouldRetryStatus = this.retryConfig.retryableStatuses.includes(
          error.status,
        );

        const shouldRetryCustom = this.retryConfig.shouldRetry(error, attempt);

        if (shouldRetryStatus && shouldRetryCustom) {
          this.events.emit("request:retry", url, error as HttpError, attempt);

          const delay = Math.min(
            this.retryConfig.initialDelay * Math.pow(2, attempt - 1),
            this.retryConfig.maxDelay,
          );

          const jitterDelay =
            delay * (1 + (Math.random() * 2 - 1) * this.retryConfig.jitter);

          await new Promise((resolve) => setTimeout(resolve, jitterDelay));
          return this.fetchWithRetry(url, init, attempt + 1);
        }
      }

      throw error;
    }
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchWithRetry(url, init);
  }

  async get(
    url: string,
    init: Omit<RequestInit, "method"> = {},
  ): Promise<Response> {
    return this.fetch(url, { ...init, method: "GET" });
  }

  async post(
    url: string,
    init: Omit<RequestInit, "method"> = {},
  ): Promise<Response> {
    return this.fetch(url, { ...init, method: "POST" });
  }

  async put(
    url: string,
    init: Omit<RequestInit, "method"> = {},
  ): Promise<Response> {
    return this.fetch(url, { ...init, method: "PUT" });
  }

  async delete(
    url: string,
    init: Omit<RequestInit, "method"> = {},
  ): Promise<Response> {
    return this.fetch(url, { ...init, method: "DELETE" });
  }

  async patch(
    url: string,
    init: Omit<RequestInit, "method"> = {},
  ): Promise<Response> {
    return this.fetch(url, { ...init, method: "PATCH" });
  }
}

export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  return new HttpClient(config);
}
