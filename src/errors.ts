/**
 * Custom error class for HTTP errors
 */
export class HttpError extends Error {
  /**
   * HTTP status code
   */
  status: number;

  /**
   * Response body (if available)
   */
  responseBody?: unknown;

  /**
   * Original URL that caused the error
   */
  url: string;

  /**
   * Constructor for HttpError
   *
   * @param message Error message
   * @param status HTTP status code
   * @param url Request URL
   * @param responseBody Response body (if available)
   */
  constructor(
    message: string,
    status: number,
    url: string,
    responseBody?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.responseBody = responseBody;
  }

  /**
   * Check if the error has a specific status code
   *
   * @param status Status code to check
   * @returns True if the error has the specified status code
   */
  hasStatus(status: number): boolean {
    return this.status === status;
  }

  /**
   * Check if the error has a status code in the given range
   *
   * @param min Minimum status code (inclusive)
   * @param max Maximum status code (inclusive)
   * @returns True if the error status is in the range
   */
  hasStatusInRange(min: number, max: number): boolean {
    return this.status >= min && this.status <= max;
  }

  /**
   * Check if the error is a client error (4xx)
   *
   * @returns True if the error is a client error
   */
  isClientError(): boolean {
    return this.hasStatusInRange(400, 499);
  }

  /**
   * Check if the error is a server error (5xx)
   *
   * @returns True if the error is a server error
   */
  isServerError(): boolean {
    return this.hasStatusInRange(500, 599);
  }

  /**
   * Check if the response body contains a specific string
   *
   * @param text Text to search for in the response body
   * @returns True if the response body contains the text
   */
  responseContains(text: string): boolean {
    if (!this.responseBody) return false;

    const bodyStr = JSON.stringify(this.responseBody);
    return bodyStr.includes(text);
  }
}
