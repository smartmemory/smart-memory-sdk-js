import { APIError } from './APIError.js';

/**
 * Typed `APIError` subclasses for the 2.0 save receipt (SM2-SAVE-1 `save-receipt-contract.json`
 * and `save-read-client-contract.json`). Each is still an `APIError`, so `err.status`, `err.detail`
 * and `err instanceof APIError` keep working. Every one carries the handle it safely can
 * (`run_id`, `status_url`) so a caller can still poll a save that was admitted before the failure.
 */

/**
 * A receipt this reader cannot interpret. `code` is `unsupported_version` (unknown major, or no
 * `schema_version`), `unsupported_subject` (unknown `subject.kind`) or `unsupported_state` (unknown
 * `processing_stage`, `execution_state`, `outcome`, `reason` or `result_availability`). Never a
 * success: an unknown value cannot imply completion. `value` is the opaque value, `raw` the
 * undecoded body.
 */
export class UnsupportedReceiptError extends APIError {
  constructor(message, code, { run_id = null, status_url = null, field = null, value = null, raw = null } = {}) {
    super(message, 0, code);
    this.name = 'UnsupportedReceiptError';
    this.code = code;
    this.run_id = run_id;
    this.status_url = status_url;
    this.field = field;
    this.value = value;
    this.raw = raw;
  }
}

/**
 * Pre-admission rejection of a save or edit (HTTP 409, no new run). `code` is `revision_conflict`
 * (stale `expectedRevision`, G131), `idempotency_conflict` (the key was used for a different
 * request) or `retry_key_expired` (G178: the 30-day binding is gone, ask before saving as new
 * with a new key). Never retried automatically.
 */
export class AdmissionConflictError extends APIError {
  constructor(message, code, { status = 409, detail = null, expectedRevision = null, currentRevision = null } = {}) {
    super(message, status, detail);
    this.name = 'AdmissionConflictError';
    this.code = code;
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export const STAGE_CHAIN_CODES = Object.freeze([
  'stage_result_pending',
  'stage_result_expired',
  'stage_result_unavailable',
  'stage_chain_invalid',
  'stage_scope_denied',
  'unsupported_receipt_version',
]);

/**
 * Why a public stage chain cannot proceed (ST33). `code` is one of `STAGE_CHAIN_CODES`.
 * `run_id` is the authorized receipt run, `null` when hidden. A failed job's own receipt `error`
 * is never overwritten by these codes.
 */
export class StageChainError extends APIError {
  constructor(message, code, { status = 0, detail = null, run_id = null, retryable = false } = {}) {
    super(message, status, detail);
    this.name = 'StageChainError';
    this.code = code;
    this.run_id = run_id;
    this.retryable = retryable;
  }
}
