/**
 * CORE-RERANK-EXPOSE-1 search evidence, passed through without transformation.
 * A null rerank_score means unverified, never zero or implicitly relevant.
 * Scores are raw logits only for a model whose actual activation is Identity.
 * Unknown model revision/activation never establishes cross-model comparability.
 * @typedef {'scored'|'unscored_tail'|'bypass_disabled'|'bypass_pending'|'bypass_memory_type'|'bypass_recency'|'bypass_empty_query'|'bypass_small_pool'|'model_unavailable'|'prediction_failed'|'invalid_score'|'post_rerank_insertion'|'not_reranked'} RerankStatus
 * @typedef {Object} RerankEvidence
 * @property {number|null} rerank_score
 * @property {RerankStatus} rerank_status
 * @property {{name: string, revision: string|null, activation: string|null}|null} rerank_model
 * @property {number|null} rerank_pool_size Pool before final truncation.
 * @property {number|null} rerank_candidate_count Pairs submitted to prediction.
 * @property {number|null} rerank_scored_count Finite scores obtained in the pool.
 * @property {boolean|null} rerank_pool_capped A scored head left an unscored tail.
 * @property {number|null} rerank_max_doc_chars Effective prefix limit, not dead config.
 */

import { decodeReceipt, legacyNoStatus } from './receipt.js'; // legacyNoStatus: TODO(SVC-INGEST-WAIT-STATUS-1)
import { awaitReceipt } from './awaitReceipt.js';
import { resolveIdempotencyKey, submitWithRetry, mapAdmissionError, snapshotRequest, submissionOptions } from './submit.js';

let warnedLegacyDocumentIngest = false;

function isHttpUrl(source) {
  if (typeof source !== 'string' || !/^https?:\/\//i.test(source)) return false;
  try {
    const url = new URL(source);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

// Misspellings of the `metadataFilter` option (camelCase and the wire name). Same set the service
// refuses with a 422 on POST /memory/search, plus `metadata_filter` itself, which this SDK does not accept.
const SEARCH_FILTER_NEAR_MISS_OPTIONS = new Set([
  'filters', 'filter', 'metadata_filter', 'metadata_filters', 'metadataFilters', 'where', 'meta_filter',
  'business_scope', 'valid_at', 'businessScopes', 'scope_go_lives', 'scopeGoLives',
]);

/** Convert opt-in replacement qualifiers without changing nested contract field names. */
export function validityWriteOptions({ scopeGoLives, validFrom }) {
  const body = {};
  if (scopeGoLives != null) body.scope_go_lives = scopeGoLives.map(entry => ({
    ...entry,
    valid_from: entry.valid_from instanceof Date ? entry.valid_from.toISOString() : entry.valid_from,
  }));
  if (validFrom != null) body.valid_from = validFrom instanceof Date ? validFrom.toISOString() : validFrom;
  return body;
}

export class MemoryAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * One logical save: mint (or reuse) the `idempotency_key`, retry only a 429 refusal
   * up to four attempts with identical bytes, and decode the 2.0 receipt.
   * Hosted 2.0.0 does not replay request keys yet (SVC-2.0-SAVE-KEY-REPLAY-1).
   * A lost response, 408 or 5xx surfaces once. Check the outcome before retrying.
