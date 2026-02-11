/**
 * Reasoning Traces API - System 2 Memory: extract, store, query reasoning traces.
 *
 * Covers all endpoints from reasoning_traces.py:
 *   POST /memory/reasoning/traces/extract
 *   POST /memory/reasoning/traces/store
 *   POST /memory/reasoning/traces/query
 *   GET  /memory/reasoning/traces/{trace_id}
 */
export class ReasoningTracesAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Extract reasoning traces from content.
   * @param {Object} params
   * @param {string} params.content
   * @param {number} [params.minSteps=2]
   * @param {number} [params.minQualityScore=0.4]
   * @param {boolean} [params.useLlmDetection=true]
   */
  async extract({ content, minSteps = 2, minQualityScore = 0.4, useLlmDetection = true }) {
    return this.api.post('/memory/reasoning/traces/extract', {
      content,
      min_steps: minSteps,
      min_quality_score: minQualityScore,
      use_llm_detection: useLlmDetection
    });
  }

  /**
   * Store a reasoning trace as a memory item.
   * @param {Object} params
   * @param {Object} params.trace - ReasoningTrace object
   * @param {string[]} [params.artifactIds]
   */
  async store({ trace, artifactIds = null }) {
    return this.api.post('/memory/reasoning/traces/store', {
      trace,
      artifact_ids: artifactIds
    });
  }

  /**
   * Query reasoning traces.
   * @param {Object} params
   * @param {string} params.query
   * @param {string} [params.artifactId]
   * @param {number} [params.limit=10]
   */
  async query({ query, artifactId = null, limit = 10 }) {
    return this.api.post('/memory/reasoning/traces/query', {
      query,
      artifact_id: artifactId,
      limit
    });
  }

  /**
   * Get a specific reasoning trace by ID.
   * @param {string} traceId
   */
  async get(traceId) {
    return this.api.get(`/memory/reasoning/traces/${traceId}`);
  }
}
