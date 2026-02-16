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
 *   POST /memory/decisions/{decision_id}/reinforce
 *   POST /memory/decisions/{decision_id}/contradict
 *   GET  /memory/decisions/{decision_id}/provenance
 *   GET  /memory/decisions/{decision_id}/causal-chain
 *   POST /memory/decisions/{decision_id}/conflicts
 *
 * Legacy reasoning proxies (kept for backward compatibility):
 *   POST /memory/reasoning/proof
 *   POST /memory/reasoning/fuzzy-confidence
 */
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
   */
  async create({
    content,
    decisionType = 'inference',
    confidence = 0.8,
    sourceTraceId = null,
    sourceSessionId = null,
    evidenceIds = null,
    domain = null,
    tags = null
  }) {
    return this.api.post('/memory/decisions/create', {
      content,
      decision_type: decisionType,
      confidence,
      source_trace_id: sourceTraceId,
      source_session_id: sourceSessionId,
      evidence_ids: evidenceIds,
      domain,
      tags
    });
  }

  /**
   * List active decisions with optional filters.
   * @param {Object} [params] - Query parameters (domain, decision_type, min_confidence, limit)
   */
  async list(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.api.get(`/memory/decisions${qs ? '?' + qs : ''}`);
  }

  /**
   * Search for active decisions related to a topic.
   * @param {string} topic
   * @param {number} [limit=20]
   */
  async search(topic, limit = 20) {
    return this.api.get(`/memory/decisions/search?topic=${encodeURIComponent(topic)}&limit=${limit}`);
  }

  /**
   * List pending decisions (awaiting more data via residuation).
   * @param {number} [limit=50]
   */
  async listPending(limit = 50) {
    return this.api.get(`/memory/decisions/pending?limit=${limit}`);
  }

  /**
   * Retrieve a decision by ID.
   * @param {string} decisionId
   */
  async get(decisionId) {
    return this.api.get(`/memory/decisions/${decisionId}`);
  }

  /**
   * Replace a decision with a new one, marking the old as superseded.
   * @param {string} decisionId
   * @param {Object} data
   * @param {string} data.new_content
   * @param {string} [data.new_decision_type='inference']
   * @param {number} [data.new_confidence=0.8]
   * @param {string} data.reason
   */
  async supersede(decisionId, data = {}) {
    return this.api.post(`/memory/decisions/${decisionId}/supersede`, data);
  }

  /**
   * Retract a decision (mark as no longer valid).
   * @param {string} decisionId
   * @param {string} reason
   */
  async retract(decisionId, reason) {
    return this.api.post(`/memory/decisions/${decisionId}/retract`, {
      reason
    });
  }

  /**
   * Record supporting evidence for a decision.
   * @param {string} decisionId
   * @param {string} evidenceId
   */
  async reinforce(decisionId, evidenceId) {
    return this.api.post(`/memory/decisions/${decisionId}/reinforce`, {
      evidence_id: evidenceId
    });
  }

  /**
   * Record contradicting evidence against a decision.
   * @param {string} decisionId
   * @param {string} evidenceId
   */
  async contradict(decisionId, evidenceId) {
    return this.api.post(`/memory/decisions/${decisionId}/contradict`, {
      evidence_id: evidenceId
    });
  }

  /**
   * Get full provenance chain for a decision.
   * @param {string} decisionId
   */
  async getProvenance(decisionId) {
    return this.api.get(`/memory/decisions/${decisionId}/provenance`);
  }

  /**
   * Trace causal chain from a decision.
   * @param {string} decisionId
   * @param {Object} [options]
   * @param {string} [options.direction='both'] - causes|effects|both
   * @param {number} [options.maxDepth=3]
   */
  async getCausalChain(decisionId, { direction = 'both', maxDepth = 3 } = {}) {
    return this.api.get(`/memory/decisions/${decisionId}/causal-chain?direction=${direction}&max_depth=${maxDepth}`);
  }

  /**
   * Find existing decisions that may conflict with this one.
   * @param {string} decisionId
   */
  async findConflicts(decisionId) {
    return this.api.post(`/memory/decisions/${decisionId}/conflicts`);
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
