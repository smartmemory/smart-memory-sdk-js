export class DecisionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.api.get(`/memory/decisions${qs ? '?' + qs : ''}`);
  }

  async listPending(limit = 50) {
    return this.api.get(`/memory/decisions/pending?limit=${limit}`);
  }

  async getProofTree(decisionId, maxDepth = 5) {
    return this.api.post('/memory/reasoning/proof', {
      decision_id: decisionId,
      max_depth: maxDepth
    });
  }

  async getFuzzyConfidence(decisionId) {
    return this.api.post('/memory/reasoning/fuzzy-confidence', {
      decision_id: decisionId
    });
  }

  async reinforce(decisionId, evidenceId) {
    return this.api.post(`/memory/decisions/${decisionId}/reinforce`, {
      evidence_id: evidenceId
    });
  }

  async supersede(decisionId, data = {}) {
    return this.api.post(`/memory/decisions/${decisionId}/supersede`, data);
  }

  async retract(decisionId, reason) {
    return this.api.post(`/memory/decisions/${decisionId}/retract`, {
      reason
    });
  }

  async getProvenance(decisionId) {
    return this.api.get(`/memory/decisions/${decisionId}/provenance`);
  }
}
