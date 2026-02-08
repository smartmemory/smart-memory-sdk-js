export class DecisionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.api.get(`/memory/decisions/${qs ? '?' + qs : ''}`);
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
}
