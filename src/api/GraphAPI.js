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

  /**
   * Find the shortest path between two graph nodes.
   * @param {string} startId
   * @param {string} endId
   * @param {number} [maxHops=5]
   */
  async findShortestPath(startId, endId, maxHops = 5) {
    return this.api.get(`/memory/graph/path?start_id=${encodeURIComponent(startId)}&end_id=${encodeURIComponent(endId)}&max_hops=${maxHops}`);
  }
}
