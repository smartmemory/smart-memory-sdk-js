import { APIError } from './APIError.js';

/**
 * Typed `APIError` raised by `client.setRoutingPrefs` on a lost compare-and-set
 * (`409 routing_prefs_version_conflict`, WS-ROUTING-2b). Still an `APIError`, so
 * `err.status`, `err.detail` and `err instanceof APIError` keep working. Catch it,
 * re-read with `getRoutingPrefs()` and retry with the fresh `version`.
 */
export class RoutingPrefsConflictError extends APIError {
  constructor(message, status = 409, detail = null) {
    super(message, status, detail);
    this.name = 'RoutingPrefsConflictError';
    this.errorCode = 'routing_prefs_version_conflict';
  }
}

/**
 * The server `error` code of a failed routing call: `{detail: {error: code}}`,
 * `{detail: 'code'}` or `{error: code}`. `null` when the body carries none (a 422 list,
 * plain text).
 * @param {unknown} detail - `APIError.detail`, the parsed response body.
 * @returns {string|null}
 */
export function routingErrorCode(detail) {
  if (!detail || typeof detail !== 'object') return null;
  let inner = Object.hasOwn(detail, 'detail') ? detail.detail : detail;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) inner = inner.error;
  return typeof inner === 'string' && inner ? inner : null;
}
