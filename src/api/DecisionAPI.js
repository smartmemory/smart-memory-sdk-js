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
   * @param {string} [params.agentId] - Producing agent id (CORE-AGENT-ATTRIBUTION-1).
   *   When omitted, the backend auto-populates from scope.resolve_agent_id() —
   *   non-null only when the caller's user_type=='agent'.
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
    agentId = null
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
      agent_id: agentId
    });
  }

  /**
   * List active decisions with optional filters.
   * @param {Object} [params] - Query parameters
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
   * Create a new pending decision awaiting requirements to be resolved.
   * @param {Object} params
   * @param {string} params.content
   * @param {Array} params.requirements - List of requirement objects
   * @param {string} [params.domain]
   * @param {string[]} [params.tags]
   * @param {string} [params.agentId]
   */
  async createPending({ content, requirements, domain = null, tags = null, agentId = null }) {
    return this.api.post('/memory/decisions/pending/create', {
      content,
      requirements,
      domain,
      tags,
      agent_id: agentId
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
    return this.api.post(`/memory/decisions/pending/${decisionId}/resolve`, {
      requirement_id: requirementId,
      memory_id: memoryId
    });
  }

  /**
   * Try to activate a pending decision when all requirements are resolved.
   * @param {string} decisionId
   */
  async tryActivate(decisionId) {
    return this.api.post(`/memory/decisions/pending/${decisionId}/activate`, {});
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
