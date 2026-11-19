export class APIError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [status=0] - HTTP status code (0 for network errors)
   * @param {Object|null} [detail=null] - Error detail from API response
   */
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * HTTP 409 `decision_history_protected` (DECISION-DOOR-1 shape (b)): a generic write (a memory patch, an edge or
 * link, a graph bulk call) would change a decision's status, supersession or lifecycle links, so the service wrote
 * nothing. Decision history changes only through the decision routes (`DecisionAPI`). A subclass of `APIError`, so
 * existing `instanceof APIError` and `status === 409` checks still hold.
 */
export class DecisionHistoryProtectedError extends APIError {
  static code = 'decision_history_protected';

  constructor(message, detail = null) {
    super(message, 409, detail);
    this.name = 'DecisionHistoryProtectedError';
    this.code = DecisionHistoryProtectedError.code;
  }
}
