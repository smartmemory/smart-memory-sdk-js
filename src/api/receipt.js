/**
 * 2.0 save receipt (SM2-SAVE-1 `save-receipt-contract.json`, schema_version 1.x; G52/G53/G128/G173).
 *
 * `create`, `ingest`, `ingestConversation`, `ingestDocument`, an edit with `expectedRevision` and the
 * five public pipeline stage calls resolve to a `SaveReceipt`. Read the wire fields as sent
 * (`receipt.run_id`, `receipt.status_url`, `receipt.revision`, ...). `receipt.item_id` delegates to
 * `subject.item_id`, and `String(receipt)` is `'<subject id> (<status>)'`, e.g. `mem_123 (stored)`.
 * It never implies completion unless the receipt is terminal.
 */
import { UnsupportedReceiptError, AdmissionConflictError } from '../errors/ReceiptErrors.js';

const SUPPORTED_MAJOR = 1;

const SUBJECT_KINDS = new Set([
  'item_save', 'document_save', 'generation_save', 'edit',
  'manual_occurrence', 'scheduled_occurrence', 'stage_job', 'system_job',
]);

// Contract enums, null allowed where the contract allows it. An unknown value is unsupported_state.
const STATE_ENUMS = {
  processing_stage: new Set(['received', 'stored', 'extracted', null]),
  execution_state: new Set(['queued', 'waiting', 'running', 'paused', 'completed', 'failed', 'dead', null]),
  outcome: new Set(['completed', 'skipped', 'no_op', 'partial', 'failed', 'dead', null]),
  reason: new Set(['allowance', 'authority', 'key_needed', 'dependency', 'retry_backoff', null]),
  result_availability: new Set(['pending', 'available', 'expired', 'none']),
};

const ID_ACCESSORS = ['item_id', 'document_id', 'generation_id', 'occurrence_id'];

export class SaveReceipt {
  /** @param {object} raw A receipt body that already passed `decodeReceipt`. */
  constructor(raw) {
    for (const [key, value] of Object.entries(raw)) {
      // item_id etc. are accessors over `subject`; a body-level copy would shadow them.
      if (!ID_ACCESSORS.includes(key)) this[key] = value;
    }
  }

  get item_id() { return this.subject?.item_id; }
  get document_id() { return this.subject?.document_id; }
  get generation_id() { return this.subject?.generation_id; }
  get occurrence_id() { return this.subject?.occurrence_id; }

  /** Current status text: the terminal fate once terminal, else the last save milestone, else the activity. */
  get status() {
    if (this.terminal) return this.outcome;
    return this.processing_stage ?? this.execution_state;
  }

  toString() {
    const id = this.item_id ?? this.document_id ?? this.generation_id ?? this.occurrence_id ?? this.run_id;
    return `${id} (${this.status})`;
  }

  /** Plain JSON copy of every field, unknown ones included. */
  toJSON() {
    return { ...this };
  }
}

function handleOf(raw) {
  return {
    run_id: typeof raw?.run_id === 'string' ? raw.run_id : null,
    status_url: typeof raw?.status_url === 'string' ? raw.status_url : null,
  };
}

function refuse(message, code, raw, extra = {}) {
  const handle = handleOf(raw);
  console.warn(`[receipt] ${code}: ${message} (run_id=${handle.run_id}); the receipt was not decoded and is not treated as success`);
  return new UnsupportedReceiptError(message, code, { ...handle, ...extra, raw });
}

/** The scoped `admission_error` of a conflict body, whether top-level or FastAPI-wrapped in `detail`. */
export function admissionErrorOf(body) {
  if (!body || typeof body !== 'object') return null;
  const found = body.admission_error ?? body.detail?.admission_error;
  return found && typeof found === 'object' && typeof found.code === 'string' ? { found, body: body.admission_error ? body : body.detail } : null;
}

/**
 * Compatible major-1 reader (contract `x-reader-decoder`). Handle and opaque additions are kept,
 * known fields decoded, and anything unknown is a typed refusal that carries the handle.
 *
 * @param {object} raw JSON body of a 2xx save, edit, stage or status response.
 * @returns {SaveReceipt}
 * @throws {AdmissionConflictError} the body is a pre-admission conflict.
 * @throws {UnsupportedReceiptError} unknown major, subject or state, or not a receipt at all.
 */
export function decodeReceipt(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw refuse('response is not a receipt object', 'unsupported_version', null);
  }
  const conflict = admissionErrorOf(raw);
  if (conflict) {
    throw new AdmissionConflictError(conflict.found.message || conflict.found.code, conflict.found.code, {
      status: 409,
      detail: raw,
      expectedRevision: conflict.body.expected_revision ?? null,
      currentRevision: conflict.body.current_revision ?? null,
    });
  }
  const match = typeof raw.schema_version === 'string' ? /^(\d+)\.(\d+)$/.exec(raw.schema_version) : null;
  if (!match || Number(match[1]) !== SUPPORTED_MAJOR) {
    throw refuse(`unsupported receipt schema_version ${JSON.stringify(raw.schema_version ?? null)}`, 'unsupported_version', raw, { field: 'schema_version', value: raw.schema_version ?? null });
  }
  const handle = handleOf(raw);
  if (!handle.run_id || !handle.status_url) {
    throw refuse('receipt has no run_id/status_url handle', 'unsupported_version', raw, { field: 'run_id' });
  }
  const kind = raw.subject?.kind;
  if (!SUBJECT_KINDS.has(kind)) {
    throw refuse(`unknown receipt subject kind ${JSON.stringify(kind ?? null)}`, 'unsupported_subject', raw, { field: 'subject.kind', value: kind ?? null });
  }
  for (const [field, allowed] of Object.entries(STATE_ENUMS)) {
    const value = raw[field] === undefined ? null : raw[field];
    if (!allowed.has(value)) {
      throw refuse(`unknown receipt ${field} ${JSON.stringify(value)}`, 'unsupported_state', raw, { field, value });
    }
  }
  return new SaveReceipt(raw);
}

/** A pending copy of `receipt` flagged as a client-side await timeout (G173). Not a server transition. */
export function timedOut(receipt) {
  const copy = new SaveReceipt({ ...receipt });
  copy.client_timed_out = true;
  return copy;
}
