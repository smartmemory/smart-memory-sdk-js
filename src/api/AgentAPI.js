export class AgentAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list() {
    return this.api.get('/memory/agents');
  }

  async create({ name, description = null, agentConfig = {}, roles = ['user'] }) {
    return this.api.post('/memory/agents', {
      name,
      description,
      agent_config: agentConfig,
      roles
    });
  }

  async get(agentId) {
    return this.api.get(`/memory/agents/${agentId}`);
  }

  async delete(agentId) {
    return this.api.delete(`/memory/agents/${agentId}`);
  }

  async getRecallProfile(agentId) {
    return this.api.get(`/memory/agents/${agentId}/recall-profile`);
  }

  async setRecallProfile(agentId, recallProfile) {
    return this.api.put(`/memory/agents/${agentId}/recall-profile`, { recall_profile: recallProfile });
  }

  /**
   * Get the current evaluation for an agent on a given (dimension, domain) slot.
   *
   * CORE-AGENT-2 S03-T11. Returns { evaluation: object | null }.
   * null means no evaluation has been written yet (cold-start) — not an error.
   *
   * @param {string} agentId - Agent identifier.
   * @param {string} dimension - Performance dimension (e.g. "decision_volume").
   * @param {string} domain - Domain string (e.g. "python").
   * @returns {Promise<{evaluation: object|null}>}
   */
  async getEvaluation(agentId, dimension, domain) {
    const qs = new URLSearchParams({ dimension, domain }).toString();
    return this.api.get(`/memory/agents/${agentId}/evaluation${qs ? '?' + qs : ''}`);
  }

  /**
   * Get evaluation history for an agent on a given (dimension, domain) slot.
   *
   * CORE-AGENT-2 S03-T11. Returns { history: object[] } sorted most-recent-first.
   *
   * @param {string} agentId - Agent identifier.
   * @param {string} dimension - Performance dimension.
   * @param {string} domain - Domain string.
   * @param {object} [options]
   * @param {number} [options.limit=20] - Maximum records to return.
   * @returns {Promise<{history: object[]}>}
   */
  async listEvaluationHistory(agentId, dimension, domain, { limit = 20 } = {}) {
    const qs = new URLSearchParams({ dimension, domain, limit: String(limit) }).toString();
    return this.api.get(`/memory/agents/${agentId}/evaluation/history${qs ? '?' + qs : ''}`);
  }
}
