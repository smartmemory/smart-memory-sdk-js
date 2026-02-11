/**
 * Reasoning API - Assertion challenging, conflict resolution, and symbolic reasoning.
 *
 * Covers all endpoints from reasoning.py:
 *   POST /memory/reasoning/challenge
 *   POST /memory/reasoning/resolve
 *   GET  /memory/reasoning/conflicts
 *   GET  /memory/reasoning/low-confidence
 *   GET  /memory/reasoning/confidence-history/{item_id}
 *   POST /memory/reasoning/query
 *   POST /memory/reasoning/proof
 *   POST /memory/reasoning/fuzzy-confidence
 */
export class ReasoningAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  // === ASSERTION CHALLENGING ===

  /**
   * Challenge an assertion against existing knowledge.
   * @param {Object} params
   * @param {string} params.assertion
   * @param {string} [params.memoryType='semantic']
   * @param {boolean} [params.useLlm=true]
   */
  async challenge({ assertion, memoryType = 'semantic', useLlm = true }) {
    return this.api.post('/memory/reasoning/challenge', {
      assertion,
      memory_type: memoryType,
      use_llm: useLlm
    });
  }

  /**
   * Resolve a conflict between assertions.
   * @param {Object} params
   * @param {string} params.existingItemId
   * @param {string} params.newFact
   * @param {boolean} [params.autoResolve=true]
   * @param {string} [params.strategy]
   * @param {boolean} [params.useWikipedia=true]
   * @param {boolean} [params.useLlm=true]
   */
  async resolve({ existingItemId, newFact, autoResolve = true, strategy = null, useWikipedia = true, useLlm = true }) {
    return this.api.post('/memory/reasoning/resolve', {
      existing_item_id: existingItemId,
      new_fact: newFact,
      auto_resolve: autoResolve,
      strategy,
      use_wikipedia: useWikipedia,
      use_llm: useLlm
    });
  }

  // === CONFLICT QUERIES ===

  /**
   * List memory items that have unresolved conflicts.
   * @param {Object} [options]
   * @param {boolean} [options.needsReview=true]
   * @param {number} [options.limit=50]
   */
  async listConflicts({ needsReview = true, limit = 50 } = {}) {
    return this.api.get(`/memory/reasoning/conflicts?needs_review=${needsReview}&limit=${limit}`);
  }

  /**
   * Get items with confidence below threshold.
   * @param {Object} [options]
   * @param {number} [options.threshold=0.5]
   * @param {number} [options.limit=50]
   */
  async getLowConfidence({ threshold = 0.5, limit = 50 } = {}) {
    return this.api.get(`/memory/reasoning/low-confidence?threshold=${threshold}&limit=${limit}`);
  }

  /**
   * Get confidence decay history for a specific item.
   * @param {string} itemId
   */
  async getConfidenceHistory(itemId) {
    return this.api.get(`/memory/reasoning/confidence-history/${itemId}`);
  }

  // === SYMBOLIC REASONING ===

  /**
   * Route a query through the symbolic/semantic router.
   * @param {string} query
   * @param {number} [topK=10]
   */
  async query(query, topK = 10) {
    return this.api.post('/memory/reasoning/query', {
      query,
      top_k: topK
    });
  }

  /**
   * Build an auditable proof tree for a decision.
   * @param {string} decisionId
   * @param {number} [maxDepth=5]
   */
  async proof(decisionId, maxDepth = 5) {
    return this.api.post('/memory/reasoning/proof', {
      decision_id: decisionId,
      max_depth: maxDepth
    });
  }

  /**
   * Get multi-dimensional confidence score for a decision.
   * @param {string} decisionId
   */
  async fuzzyConfidence(decisionId) {
    return this.api.post('/memory/reasoning/fuzzy-confidence', {
      decision_id: decisionId
    });
  }
}
