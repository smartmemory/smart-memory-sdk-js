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
    return this.api.get('/memory/graph/health');
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

  /**
   * Fetch the full knowledge graph.
   * @param {number} [limit] - Optional client hint; backend enforces hard cap.
   */
  async getFullGraph(limit) {
    if (limit == null) {
      return this.api.get('/memory/graph/full');
    }
    return this.api.get(`/memory/graph/full?limit=${encodeURIComponent(limit)}`);
  }

  /**
   * Fetch edges for multiple node IDs in bulk.
   * @param {string[]} nodeIds
   */
  async getEdgesBulk(nodeIds) {
    return this.api.post('/memory/graph/edges', { node_ids: nodeIds });
  }

  /**
   * Get Wikipedia grounding status for an entity node.
   * @param {string} nodeId
   */
  async getGroundingStatus(nodeId) {
    return this.api.get(`/memory/graph/nodes/${encodeURIComponent(nodeId)}/grounding`);
  }

  /**
   * Update an entity node's label or type. Triggers ontology self-learning.
   * @param {string} nodeId
   * @param {Object} updates - { label, entity_type }
   */
  async updateEntityNode(nodeId, updates) {
    return this.api.patch(`/memory/graph/nodes/${encodeURIComponent(nodeId)}`, updates);
  }

  /**
   * Remove Wikipedia grounding from an entity node.
   * @param {string} nodeId
   */
  async removeGrounding(nodeId) {
    return this.api.delete(`/memory/graph/nodes/${encodeURIComponent(nodeId)}/grounding`);
  }

  /**
   * Delete an entity graph node and all its edges.
   * @param {string} nodeId
   */
  async deleteEntityNode(nodeId) {
    return this.api.delete(`/memory/graph/nodes/${encodeURIComponent(nodeId)}`);
  }

  /**
   * Get links for a memory item.
   * @param {string} itemId
   */
  async getLinks(itemId) {
    return this.api.get(`/memory/${encodeURIComponent(itemId)}/links`);
  }
}
