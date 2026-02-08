export class GraphAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async getNeighbors(itemId) {
    return this.api.get(`/memory/${itemId}/neighbors`);
  }

  async addEdge(sourceId, targetId, relationType, properties = {}) {
    return this.api.post('/memory/edge', {
      source_id: sourceId,
      target_id: targetId,
      relation_type: relationType,
      properties
    });
  }

  async getHealth() {
    return this.api.get('/memory/validation/health');
  }

  async getInferenceRules() {
    return this.api.get('/memory/validation/inference/rules');
  }

  async runInference(ruleNames = []) {
    return this.api.post('/memory/validation/inference', {
      rule_names: ruleNames
    });
  }
}
