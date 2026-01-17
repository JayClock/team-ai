import { SafeAny } from '../archtype/safe-any.js';

/**
 * HTTP error thrown when servers return error status codes (4xx, 5xx).
 *
 * Contains the original Response object for accessing error details,
 * headers, and body content.
 *
 * @example
 * ```typescript
 * try {
 *   await resource.get();
 * } catch (error) {
 *   if (error instanceof HttpError) {
 *     console.log(error.status); // e.g., 404
 *     console.log(error.response.statusText);
 *   }
 * }
 * ```
 *
 * @category Other
 */
export class HttpError extends Error {
  /** The original fetch Response object */
  response: Response;
  /** HTTP status code (e.g., 404, 500) */
  status: number;

  constructor(response: Response) {
    super('HTTP error ' + response.status);
    this.response = response;
    this.status = response.status;
  }
}

/**
 * RFC 7807 Problem Details error response.
 *
 * Extends HttpError for servers that return `application/problem+json`
 * responses with structured error information.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc7807 | RFC 7807}
 *
 * @category Other
 */
export class Problem extends HttpError {
  body: {
    type: string;
    title?: string;
    status: number;
    detail?: string;
    instance?: string;
    [x: string]: SafeAny;
  };

  constructor(response: Response, problemBody: Record<string, SafeAny>) {
    super(response);

    this.body = {
      type: problemBody.type ?? 'about:blank',
      status: problemBody.status ?? this.status,
      ...problemBody,
    };

    if (this.body.title) {
      this.message = 'HTTP Error ' + this.status + ': ' + this.body.title;
    }
  }
}

/**
 * This function creates problems, not unlike the the author of this file.
 *
 * It takes a Fetch Response object, and returns a HttpError. If the HTTP
 * response has a type of application/problem+json it will return a Problem
 * object.
 *
 * Because parsing the response might be asynchronous, the function returns
 * a Promise resolving in either object.
 */
export default async function problemFactory(
  response: Response,
): Promise<HttpError | Problem> {
  const contentType = response.headers.get('Content-Type');
  if (contentType?.match(/^application\/problem\+json/i)) {
    const problemBody = (await response.json()) as Record<string, SafeAny>;
    return new Problem(response, problemBody);
  } else {
    return new HttpError(response);
  }
}
