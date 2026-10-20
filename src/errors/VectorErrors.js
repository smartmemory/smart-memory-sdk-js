import { APIError } from './APIError.js';

/**
 * Typed `APIError` subclasses raised by the `client.vector` methods
 * (WEB-VECTOR-SEARCH-TAB-1). Each is still an `APIError`, so `err.status`, `err.detail`
 * and `err instanceof APIError` keep working. Other statuses (400, 403, 500) stay a
 * plain `APIError`.
 */

/** HTTP 404: unknown collection, item not visible, or no vector row (`detail.detail === 'no_vector'`). */
export class VectorNotFoundError extends APIError {
  constructor(message, status = 404, detail = null) {
    super(message, status, detail);
    this.name = 'VectorNotFoundError';
  }
}

/** HTTP 501: the active backend does not implement the capability. Never an empty result. */
export class VectorUnsupportedError extends APIError {
  constructor(message, status = 501, detail = null) {
    super(message, status, detail);
    this.name = 'VectorUnsupportedError';
  }
}

/** HTTP 503: the vector backend reported a substrate error, surfaced instead of an empty page. */
export class VectorSubstrateError extends APIError {
  constructor(message, status = 503, detail = null) {
    super(message, status, detail);
    this.name = 'VectorSubstrateError';
  }
}
