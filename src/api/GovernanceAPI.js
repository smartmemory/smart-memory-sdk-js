/**
 * Governance API - Ontology governance analysis, violations, and auto-fix.
 *
 * Covers all endpoints from governance.py:
 *   POST /memory/governance/run_analysis
 *   GET  /memory/governance/violations
 *   GET  /memory/governance/violations/{violation_id}
 *   POST /memory/governance/apply_decision
 *   POST /memory/governance/auto_fix
 *   GET  /memory/governance/summary
 */
export class GovernanceAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Run governance analysis.
   * @param {Object} [options]
   * @param {string} [options.query='*']
   * @param {number} [options.topK=100]
   * @param {Object[]} [options.memoryItems] - Direct items to analyze
   */
  async runAnalysis({ query = '*', topK = 100, memoryItems = [] } = {}) {
    return this.api.post('/memory/governance/run_analysis', {
      query,
      top_k: topK,
      memory_items: memoryItems
    });
  }

  /**
   * List violations available for review.
   * @param {Object} [options]
   * @param {string} [options.severity] - Filter: low|medium|high|critical
   * @param {boolean} [options.autoFixableOnly=false]
   */
  async listViolations({ severity = null, autoFixableOnly = false } = {}) {
    const params = [];
    if (severity) params.push(`severity=${severity}`);
    if (autoFixableOnly) params.push('auto_fixable_only=true');
    const qs = params.length ? `?${params.join('&')}` : '';
    return this.api.get(`/memory/governance/violations${qs}`);
  }

  /**
   * Get a specific violation by ID.
   * @param {string} violationId
   */
  async getViolation(violationId) {
    return this.api.get(`/memory/governance/violations/${violationId}`);
  }

  /**
   * Apply a governance decision for a violation.
   * @param {Object} params
   * @param {string} params.violationId
   * @param {string} [params.action='approve'] - approve|reject|evolve_ontology|fix_data|ignore|review_later
   * @param {string} [params.rationale='']
   * @param {string} [params.decidedBy='human']
   */
  async applyDecision({ violationId, action = 'approve', rationale = '', decidedBy = 'human' }) {
    return this.api.post('/memory/governance/apply_decision', {
      violation_id: violationId,
      action,
      rationale,
      decided_by: decidedBy
    });
  }

  /**
   * Run auto-fix for high-confidence violations.
   * @param {number} [confidenceThreshold=0.8]
   */
  async autoFix(confidenceThreshold = 0.8) {
    return this.api.post('/memory/governance/auto_fix', {
      confidence_threshold: confidenceThreshold
    });
  }

  /**
   * Get a summary of governance state.
   */
  async getSummary() {
    return this.api.get('/memory/governance/summary');
  }
}
