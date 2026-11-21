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

/**
 * HTTP 409 `conflict_check_undecided` (BUG-FAIL-IF-CONFLICTED-SOURCE-DATE-1): a strict read (`failIfConflicted: true`)
 * held pairs its conflict check could not decide, for example two notes that name the same product code and give
 * different numbers the checker could not compare. Not a proven conflict, so it is not the `recall_conflict` error.
 * `pairs` (scoped id pairs) and `reason` (fixed text, no claim text) are read from the response detail. With the
 * server setting `conflict_check_unsure` at `mark` the read succeeds instead and the response carries
 * `conflict_check` (`search`) or `manifest.conflict_check` (`RecallAPI.pack`). A subclass of `APIError`, so existing
 * `instanceof APIError` and `status === 409` checks still hold.
 */
export class ConflictCheckUndecidedError extends APIError {
  static code = 'conflict_check_undecided';

  constructor(message, detail = null) {
    super(message, 409, detail);
    this.name = 'ConflictCheckUndecidedError';
    this.code = ConflictCheckUndecidedError.code;
    this.pairs = Array.isArray(detail?.detail?.pairs) ? detail.detail.pairs : [];
    this.reason = typeof detail?.detail?.reason === 'string' ? detail.detail.reason : '';
  }
}
