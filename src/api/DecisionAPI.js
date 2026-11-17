/**
 * Decision API - Decision lifecycle, provenance, causal chains, and conflict detection.
 *
 * Covers all endpoints from decisions.py:
 *   POST /memory/decisions/create
 *   GET  /memory/decisions
 *   GET  /memory/decisions/search
 *   GET  /memory/decisions/pending
 *   GET  /memory/decisions/{decision_id}
 *   POST /memory/decisions/{decision_id}/supersede
 *   POST /memory/decisions/{decision_id}/retract
 *   POST /memory/decisions/{decision_id}/restore      (DECISION-RESTORE-ONE-ACTION-1)
 *   POST /memory/decisions/{decision_id}/reinforce
 *   POST /memory/decisions/{decision_id}/evidence     (SM-EVIDENCE-TYPE-1)
 *   POST /memory/decisions/{decision_id}/contradict
 *   GET  /memory/decisions/{decision_id}/provenance
 *   GET  /memory/decisions/{decision_id}/history      (STUDIO-DECISION-VIEW-1)
 *   GET  /memory/decisions/{decision_id}/sites        (STUDIO-DECISION-VIEW-1)
 *   GET  /memory/decisions/auto-changes               (STUDIO-DECISION-VIEW-1)
 *   GET  /memory/decisions/{decision_id}/causal-chain
 *   POST /memory/decisions/{decision_id}/conflicts
 *
 * Evidence receipts (SM-EVIDENCE-TYPE-1, routes/evidence.py):
 *   POST /memory/evidence
 *   GET  /memory/evidence/{evidence_id}
 *
 * Legacy reasoning proxies (kept for backward compatibility):
 *   POST /memory/reasoning/proof
 *   POST /memory/reasoning/fuzzy-confidence
 */

import { validityWriteOptions } from './MemoryAPI.js';
import { pathId } from './pathId.js';

/** Add the optional business and independent transaction qualifiers, encoded once. */
function validityQuery({ asOf, businessScope, validAt }, sep) {
  const params = [];
  for (const [key, value] of Object.entries({ as_of: asOf, business_scope: businessScope, valid_at: validAt })) {
    if (value == null) continue;
    const encoded = key === 'business_scope' ? JSON.stringify(value) : value instanceof Date ? value.toISOString() : value;
    params.push(`${key}=${encodeURIComponent(encoded)}`);
  }
  return params.length ? sep + params.join('&') : '';
}

/** `?a=1&b=2` from the set values (dates as ISO strings, each encoded once), plus repeated `extra` pairs; '' when none. */
function queryString(values, extra = []) {
  const params = [];
  for (const [key, value] of [...Object.entries(values), ...extra]) {
    if (value == null) continue;
    params.push(`${key}=${encodeURIComponent(value instanceof Date ? value.toISOString() : value)}`);
  }
  return params.length ? `?${params.join('&')}` : '';
}

/**
 * Make a named refusal readable on a thrown APIError: `code` (the service's name, e.g. `stale_proposal`), `reason`
 * (its sentence, also `error.message`) and `retryable` (the same request may be sent again, nothing was written).
 * The service body is `{detail: {code, message, retryable}}` or `{detail: "sentence"}`.
 */
function nameRefusal(error) {
  const inner = error?.detail?.detail;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    if (typeof inner.code === 'string' && inner.code) error.code = inner.code;
    error.reason = typeof inner.message === 'string' ? inner.message : error.message;
    error.retryable = inner.retryable === true;
  } else if (error && typeof error === 'object') {
    error.reason = typeof inner === 'string' ? inner : error.message;
    error.retryable = false;
  }
  return error;
}

/** CLAIMS-BUILD-20: the decision "who" fields, sent only when given. */
function statedBy({ decidedBy, recommendedBy }) {
  return {
    ...(decidedBy != null ? { decided_by: decidedBy } : {}),
    ...(recommendedBy != null ? { recommended_by: recommendedBy } : {})
  };
}

/** The body keys `POST /memory/decisions/{id}/supersede` accepts (SupersedeRequest), sent as given. */
const SUPERSEDE_KEYS = new Set([
  'new_content', 'new_decision_type', 'new_confidence', 'reason', 'rejected_alternatives', 'rationale', 'constraints',
  'decided_by', 'recommended_by', 'valid_from', 'scope_go_lives'
]);

/**
 * CLAIMS-20-FIX1: map supersede's camelCase spellings and refuse a key the service would silently ignore.
 * @throws {TypeError} on an unknown key, or one field given in both spellings with different values
 */
function supersedeBody(data) {
  const { scopeGoLives, validFrom, decidedBy, recommendedBy, ...rest } = data;
  const unknown = Object.keys(rest).filter(key => !SUPERSEDE_KEYS.has(key));
  if (unknown.length) throw new TypeError(`supersede: unknown field(s) ${unknown.join(', ')}`);
  const stated = statedBy({ decidedBy, recommendedBy });
  for (const [key, value] of Object.entries(stated)) {
    if (rest[key] != null && rest[key] !== value) throw new TypeError(`supersede: ${key} given twice with different values`);
  }
  return { ...rest, ...stated, ...validityWriteOptions({ scopeGoLives, validFrom }) };
}

export class DecisionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Create a new decision with provenance tracking.
   * @param {Object} params
   * @param {string} params.content
   * @param {string} [params.decisionType='inference']
   * @param {number} [params.confidence=0.8]
   * @param {string} [params.sourceTraceId]
   * @param {string} [params.sourceSessionId]
   * @param {string[]} [params.evidenceIds]
   * @param {string} [params.domain]
   * @param {string[]} [params.tags]
   * @param {Array<{scope: {site: string}|null, valid_from: string|Date}>} [params.scopeGoLives]
   * @param {string} [params.agentId] - Producing agent id (CORE-AGENT-ATTRIBUTION-1).
   *   When omitted, the backend auto-populates from scope.resolve_agent_id() —
   *   non-null only when the caller's user_type=='agent'.
   * @param {string} [params.decidedBy] - Who decided, as the caller states it (plain text, at most 256
   *   characters). Caller-supplied, not verified, never used for authorization (CLAIMS-BUILD-20).
   * @param {string} [params.recommendedBy] - Who recommended it, same rules as decidedBy.
   */
  async create({
    content,
    decisionType = 'inference',
    confidence = 0.8,
    sourceTraceId = null,
    sourceSessionId = null,
    evidenceIds = null,
    domain = null,
    tags = null,
    rejectedAlternatives = null,
    rationale = null,
    constraints = null,
    agentId = null,
    scopeGoLives,
    decidedBy,
    recommendedBy
  }) {
    return this.api.post('/memory/decisions/create', {
      content,
      decision_type: decisionType,
      confidence,
      source_trace_id: sourceTraceId,
      source_session_id: sourceSessionId,
      evidence_ids: evidenceIds,
      domain,
      tags,
      rejected_alternatives: rejectedAlternatives,
      rationale,
      constraints,
      agent_id: agentId,
      ...statedBy({ decidedBy, recommendedBy }),
      ...validityWriteOptions({ scopeGoLives })
    });
  }

  /**
   * List active decisions with optional filters.
   * @param {Object} [params] - Query parameters
   * @param {{site: string}} [params.businessScope] Exact business site, independent of security scope.
   * @param {string|Date} [params.validAt] Business effective instant, defaults to request-start now.
   * @param {string} [params.domain] - Filter by domain
   * @param {string} [params.decision_type] - Filter by decision type
   * @param {number} [params.min_confidence=0.0] - Minimum confidence (0..1)
   * @param {number} [params.limit=50] - Maximum results
   * @param {string} [params.agent_id] - Filter by producing agent id
   *   (CORE-AGENT-ATTRIBUTION-1). NULL-valued rows are excluded when set.
   * @param {string} [params.provenance_memory_id] - Inverse-provenance filter
   *   (CORE-DECISION-PROVENANCE-LOOKUP-1). When set, returns only decisions whose
   *   provenance subgraph contains this memory id. Filters compose in-query so
   *   the response never silently truncates below `limit` when more matches exist.
   *   Unknown or out-of-scope memory ids return an empty list (never 404).
   * @param {string} [params.asOf] - ISO 8601 instant (SM-ASOF-DECISIONS-1), sent as
   *   `as_of` (`params.as_of` also works): the decisions active at that instant, at
   *   the version live then. Omitted means now. Does not combine with
   *   `provenance_memory_id` (400).
   *
   * Every returned decision carries three Dempster-Shafer belief reads derived from
   * its reinforce/contradict evidence (CORE-DECISION-BELIEF-SURFACE-1):
   * `belief_hold` (lower bound that the decision should stand), `plausibility_hold`
   * (upper bound), and `ignorance` (the width of that interval, so 1.0 means no
   * evidence has been recorded either way). They are evidence-only and independent of
   * the prior scalar `confidence`, and they separate "disputed" (high `contest`) from
   * "not yet known" (high `ignorance`) -- a distinction `stability` cannot express,
   * since it reads 0.5 for both.
   */
  async list(params = {}) {
    const { asOf, businessScope, validAt, ...rest } = params;
    if (asOf !== undefined && asOf !== null) rest.as_of = asOf instanceof Date ? asOf.toISOString() : asOf;
    if (businessScope != null) rest.business_scope = JSON.stringify(businessScope);
    if (validAt != null) rest.valid_at = validAt instanceof Date ? validAt.toISOString() : validAt;
    const qs = new URLSearchParams(rest).toString();
    return this.api.get(`/memory/decisions${qs ? '?' + qs : ''}`);
  }

  /**
   * Search for active decisions related to a topic.
   * @param {string} topic
   * @param {number} [limit=20]
   * @param {Object} [options]
   * @param {{site: string}} [options.businessScope] Exact site.
   * @param {string|Date} [options.validAt] Business effective instant.
   * @param {string|Date} [options.asOf] - ISO 8601 instant (SM-ASOF-DECISIONS-1): answer from
   *   the decision state at that instant (status, statement and version live then, never
   *   notes added later). Sent as `as_of` only when set; omitted means now. A bad value is
   *   a 400 `invalid_as_of`.
   *
   * Every returned decision carries three Dempster-Shafer belief reads derived from
   * its reinforce/contradict evidence (CORE-DECISION-BELIEF-SURFACE-1):
   * `belief_hold` (lower bound that the decision should stand), `plausibility_hold`
   * (upper bound), and `ignorance` (the width of that interval, so 1.0 means no
   * evidence has been recorded either way). They are evidence-only and independent of
   * the prior scalar `confidence`, and they separate "disputed" (high `contest`) from
   * "not yet known" (high `ignorance`) -- a distinction `stability` cannot express,
   * since it reads 0.5 for both.
   */
  async search(topic, limit = 20, { asOf, businessScope, validAt } = {}) {
    return this.api.get(
      `/memory/decisions/search?topic=${encodeURIComponent(topic)}&limit=${limit}${validityQuery({ asOf, businessScope, validAt }, '&')}`,
    );
  }

  /**
   * List pending decisions (awaiting more data via residuation).
   * @param {number} [limit=50]
   */
  async listPending(limit = 50) {
    return this.api.get(`/memory/decisions/pending?limit=${limit}`);
  }

  /**
   * Create a new pending decision awaiting requirements to be resolved.
   * @param {Object} params
   * @param {string} params.content
   * @param {Array} params.requirements - List of requirement objects
   * @param {string} [params.domain]
   * @param {string[]} [params.tags]
   * @param {string} [params.agentId]
   * @param {string} [params.decidedBy] - Who decided, as the caller states it (plain text, at most 256
   *   characters). Caller-supplied, not verified, never used for authorization (CLAIMS-BUILD-20).
   * @param {string} [params.recommendedBy] - Who recommended it, same rules as decidedBy.
   */
  async createPending({ content, requirements, domain = null, tags = null, agentId = null, decidedBy, recommendedBy }) {
    return this.api.post('/memory/decisions/pending/create', {
      content,
      requirements,
      domain,
      tags,
      agent_id: agentId,
      ...statedBy({ decidedBy, recommendedBy })
    });
  }

  /**
   * Resolve a requirement on a pending decision.
   * @param {string} decisionId
   * @param {Object} params
   * @param {string} params.requirementId
   * @param {string} params.memoryId
   */
  async resolveRequirement(decisionId, { requirementId, memoryId }) {
    return this.api.post(`/memory/decisions/pending/${pathId(decisionId, '/memory/decisions/pending/')}/resolve`, {
      requirement_id: requirementId,
      memory_id: memoryId
    });
  }

  /**
   * Try to activate a pending decision when all requirements are resolved.
   * @param {string} decisionId
   */
  async tryActivate(decisionId) {
    return this.api.post(`/memory/decisions/pending/${pathId(decisionId, '/memory/decisions/pending/')}/activate`, {});
  }

  /**
   * Retrieve a decision by ID.
   * @param {string} decisionId
   *
   * Every returned decision carries three Dempster-Shafer belief reads derived from
   * its reinforce/contradict evidence (CORE-DECISION-BELIEF-SURFACE-1):
   * `belief_hold` (lower bound that the decision should stand), `plausibility_hold`
   * (upper bound), and `ignorance` (the width of that interval, so 1.0 means no
   * evidence has been recorded either way). They are evidence-only and independent of
   * the prior scalar `confidence`, and they separate "disputed" (high `contest`) from
   * "not yet known" (high `ignorance`) -- a distinction `stability` cannot express,
   * since it reads 0.5 for both.
   */
  /** @param {{asOf?: string|Date, businessScope?: {site: string}, validAt?: string|Date}} [options] */
  async get(decisionId, { asOf, businessScope, validAt } = {}) {
    return this.api.get(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}${validityQuery({ asOf, businessScope, validAt }, '?')}`);
  }

  /**
   * Replace a decision globally, or schedule a site rollout without globally closing its predecessor.
   * @param {string} decisionId
   * @param {Object} data
   * @param {Array<{scope: {site: string}|null, valid_from: string|Date}>} [data.scopeGoLives]
   * @param {string|Date} [data.validFrom] Legacy global date, incompatible with scopeGoLives.
   * @param {string} data.new_content
   * @param {string} [data.new_decision_type='inference']
   * @param {number} [data.new_confidence=0.8]
   * @param {string} data.reason
   * @param {string[]|null} [data.rejected_alternatives=null]
   * @param {string|null} [data.rationale=null]
   * @param {string[]|null} [data.constraints=null]
   * @param {string|null} [data.decidedBy] Who decided the replacement, as the caller states it (plain text, at
   *   most 256 characters). Caller-supplied, not verified, never used for authorization (CLAIMS-BUILD-20).
   *   `data.decided_by` is accepted too.
   * @param {string|null} [data.recommendedBy] Who recommended the replacement, same rules (`data.recommended_by` too).
   * @returns {Promise<{old_decision_id: string, new_decision_id: string|null, status: string, review_id?: string}>}
   *   `status` is `'superseded'`, or `'held_for_review'` when the workspace's supersession policy is `propose`: then
   *   nothing was replaced, the old decision stays active, `new_decision_id` is null and `review_id` names the review
   *   that decides it (accept with `client.reasoning.settleReview(reviewId, {action: 'keep_b', reason})`).
   * @throws {TypeError} on a key the service does not accept (it would be silently ignored), or a field given in both
   *   spellings with different values.
   */
  async supersede(decisionId, data = {}) {
    return this.api.post(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/supersede`, supersedeBody(data));
  }

  /**
   * Retract a decision (mark as no longer valid).
   * @param {string} decisionId
   * @param {string} reason
   */
  async retract(decisionId, reason) {
    return this.api.post(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/retract`, {
      reason
    });
  }

  /**
   * Restore a decision that a replacement wrongly retired, in one call (DECISION-RESTORE-ONE-ACTION-1).
   * The replacement stays active and the undone link is kept in history. Owner only.
   * Refusals: 404 not_found, 403 not_owner, 409 not_retired | scheduled | replaced_again | replacement_unreadable.
   * A decision read's lifecycle notes in context_snapshot (retired_by, superseded_reason, superseded_at, retracted_by,
   * retraction_reason, retracted_at, restored_by, restored_at, restore_reason, restored_from_replacement) come from
   * the decision's history, not from what an update wrote under those names.
   * @param {string} decisionId - the retired (superseded) decision
   * @param {string} reason - why the retirement was wrong (required, not blank)
   * @returns {Promise<{decision_id: string, status: string, replacement_decision_id: string, replacement_rule: string, restored_at: string, restored_by: string}>}
   */
  async restore(decisionId, reason) {
    return this.api.post(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/restore`, {
      reason
    });
  }

  /**
   * Record supporting evidence for a decision.
   * @param {string} decisionId
   * @param {string} evidenceId
   */
  async reinforce(decisionId, evidenceId) {
    return this.api.post(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/reinforce`, {
      evidence_id: evidenceId
    });
  }

  /**
   * Link a stored evidence receipt to a live decision (SM-EVIDENCE-TYPE-1).
   * Confidence is unchanged (reinforce raises it); linking twice adds nothing.
   * The service answers 404 for a missing decision or evidence, 409 for a superseded or
   * retracted decision and 422 for a node that is not evidence.
   * @param {string} decisionId
   * @param {string} evidenceId - the evidence node id or the Compose `ev:` ref
   * @returns {Promise<{decision_id: string, evidence_id: string, evidence_ids: string[], confidence: number}>}
   */
  async linkDecisionEvidence(decisionId, evidenceId) {
    return this.api.post(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/evidence`, {
      evidence_id: evidenceId
    });
  }

  /**
   * Store one checked Compose evidence receipt as an `evidence` memory (SM-EVIDENCE-TYPE-1).
   * Saving the same record again is a no-op; a different body under a stored id is refused (409).
   * @param {Object} record - Compose `contracts/evidence.schema.json#/definitions/record`:
   *   id (`ev:` + 16 hex), evidence (kind-specific, with `at` and `by`), checked_at, checks, subject?
   * @returns {Promise<Object>} evidence_id, evidence_ref, kind, subject, checker, observed_at,
   *   checked_at, checks, payload and the round-tripped `record`
   */
  async recordEvidence(record) {
    return this.api.post('/memory/evidence', { record });
  }

  /**
   * Read one evidence receipt by node id or `ev:` ref (SM-EVIDENCE-TYPE-1); 404 when absent.
   * @param {string} evidenceId
   */
  async getEvidence(evidenceId) {
    return this.api.get(`/memory/evidence/${encodeURIComponent(evidenceId)}`);
  }

  /**
   * Record contradicting evidence against a decision.
   * @param {string} decisionId
   * @param {string} evidenceId
   */
  async contradict(decisionId, evidenceId) {
    return this.api.post(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/contradict`, {
      evidence_id: evidenceId
    });
  }

  /**
   * Get full provenance chain for a decision.
   * @param {string} decisionId
   * @param {Object} [options]
   * @param {{site: string}} [options.businessScope] Exact site.
   * @param {string|Date} [options.validAt] Business effective instant.
   * @param {string|Date} [options.asOf] - ISO 8601 instant (SM-ASOF-DECISIONS-1): answer from
   *   the decision state at that instant (status, statement and version live then, never
   *   notes added later). Sent as `as_of` only when set; omitted means now. A bad value is
   *   a 400 `invalid_as_of`.
   */
  async getProvenance(decisionId, { asOf, businessScope, validAt } = {}) {
    return this.api.get(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/provenance${validityQuery({ asOf, businessScope, validAt }, '?')}`);
  }

  /**
   * A decision's dated history, newest first (STUDIO-DECISION-VIEW-1): every version and event (recorded, edited,
   * replaced, retracted, restored, review answers, evidence links) with who and why. Who is an actor string
   * `<kind>:<id>` such as `human:alice`.
   * @param {string} decisionId
   * @param {{limit?: number, before?: string|Date, asOf?: string|Date}} [options] `limit` 1 to 500 (service default
   *   100); `before` pages (entries strictly older); `asOf` keeps entries at or before that instant.
   * @returns {Promise<{decision_id: string, entries: Array<Object>, start: {at: string|null, kind: 'recorded'|'migrated'|'unknown', note: string}, truncated: boolean}>}
   * @throws {APIError} 404 for an unknown decision (a decision you cannot read answers the same); 400 `invalid_before`
   *   or `invalid_as_of`; 422 for a `limit` out of range.
   */
  async getHistory(decisionId, { limit, before, asOf } = {}) {
    const query = queryString({ limit, before, as_of: asOf });
    return this.api.get(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/history${query}`);
  }

  /**
   * Which rule of a decision's chain is in force at each site on one date, in one call (STUDIO-DECISION-VIEW-1).
   * @param {string} decisionId
   * @param {{at?: string|Date, scopes?: Array<{site: string}>}} [options] `at` is the date asked about (default now);
   *   `scopes` names extra sites to answer for even when no rule lists them.
   * @returns {Promise<{decision_id: string, at: string, all_sites: boolean, all_sites_from: string|null,
   *   rows: Array<{scope: Object, in_force: {decision_id: string|null, visible: boolean, from: string}|null,
   *   next: {decision_id: string|null, visible: boolean, from: string}|null}>}>}
   *   `all_sites` true means the rule applies everywhere from `all_sites_from` and `rows` is empty. `in_force` null
   *   means no rule of the chain is in force at that site on that date, never a default rule.
   * @throws {APIError} 404 for an unknown decision; 400 `invalid_scope` or `invalid_at_or_scope`.
   */
  async getSites(decisionId, { at, scopes } = {}) {
    const query = queryString({ at }, (scopes || []).map(scope => ['scope', JSON.stringify(scope)]));
    return this.api.get(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/sites${query}`);
  }

  /**
   * Rules the note reader replaced or retracted by itself, with no person approving (STUDIO-DECISION-VIEW-1).
   * Undo is `restore(oldDecisionId, reason)`.
   * @param {{since?: string|Date, status?: 'unchecked'|'checked'|'undone'|'all', limit?: number, offset?: number}} [options]
   * @returns {Promise<{items: Array<Object>, total: number, unchecked_count: number, notify: boolean,
   *   supersession: 'retire'|'propose', since: string}>}
   * @throws {APIError} 400 `invalid_status` or `invalid_since`.
   */
  async listAutoChanges({ since, status, limit, offset } = {}) {
    return this.api.get(`/memory/decisions/auto-changes${queryString({ since, status, limit, offset })}`);
  }

  /**
   * Trace causal chain from a decision.
   * @param {string} decisionId
   * @param {Object} [options]
   * @param {string} [options.direction='both'] - causes|effects|both
   * @param {number} [options.maxDepth=3]
   */
  async getCausalChain(decisionId, { direction = 'both', maxDepth = 3 } = {}) {
    return this.api.get(`/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/causal-chain?direction=${direction}&max_depth=${maxDepth}`);
  }

  /**
   * Find existing decisions that may conflict with this one.
   * @param {string} decisionId
   * @param {number} [minContest=0] - Minimum pairwise contest severity (0..1).
   */
  async findConflicts(decisionId, minContest = 0) {
    return this.api.post(
      `/memory/decisions/${pathId(decisionId, '/memory/decisions/')}/conflicts?min_contest=${encodeURIComponent(minContest)}`
    );
  }

  // --- Legacy reasoning proxies (kept for backward compatibility) ---

  /**
   * Build an auditable proof tree for a decision.
   * @param {string} decisionId
   * @param {number} [maxDepth=5]
   */
  async getProofTree(decisionId, maxDepth = 5) {
    return this.api.post('/memory/reasoning/proof', {
      decision_id: decisionId,
      max_depth: maxDepth
    });
  }

  /**
   * Get multi-dimensional confidence score for a decision.
   * @param {string} decisionId
   */
  async getFuzzyConfidence(decisionId) {
    return this.api.post('/memory/reasoning/fuzzy-confidence', {
      decision_id: decisionId
    });
  }
}
