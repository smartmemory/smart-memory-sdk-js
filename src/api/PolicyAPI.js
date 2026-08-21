/**
 * Policy API — SmartMemory-to-Stratum policy exchange (GOV-STRATUM-SEAM-1).
 *
 * Covers:
 *   GET  /memory/policy/bundle
 *   POST /memory/policy/events
 */
export class PolicyAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Compile active workspace decisions into a Stratum policy bundle.
   *
   * @param {Object} [params]
   * @param {string} [params.workflow] Workflow selector echoed by the bundle.
   * @param {string} [params.domain] Exact source-decision domain filter.
   * @param {string[]} [params.statuses=['active']] Repeatable lifecycle selector.
   * @returns {Promise<Object>} The policy-exchange contract bundle.
   */
  async getBundle({ workflow, domain, statuses = ['active'] } = {}) {
    const query = new URLSearchParams();
    if (workflow !== undefined && workflow !== null) query.append('workflow', workflow);
    if (domain !== undefined && domain !== null) query.append('domain', domain);
    if (Array.isArray(statuses)) {
      for (const status of statuses) query.append('status', status);
    }
    const qs = query.toString();
    return this.api.get(`/memory/policy/bundle${qs ? '?' + qs : ''}`);
  }

  /**
   * Record an idempotent Stratum enforcement event without reshaping contract fields.
   * @param {Object} event Enforcement event using the contract's snake_case keys.
   * @returns {Promise<Object>} `{ event_id, item_id, created, edges }`.
   */
  async recordEnforcementEvent(event) {
    return this.api.post('/memory/policy/events', event);
  }
}
