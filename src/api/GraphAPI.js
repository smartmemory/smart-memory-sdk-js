/**
 * Report returned by {@link GraphAPI#resolveAliases}.
 * @typedef {Object} AliasResolveReport
 * @property {number} resolved - Unambiguous alias surfaces merged into a canonical (plan count when dry_run).
 * @property {number} abstained - Single-token surfaces left untouched because >=2 canonical candidates existed.
 * @property {number} redirected_edges - External edges moved from alias nodes onto canonicals during the merge (0 when dry_run).
 * @property {string[]} ambiguous - The abstained surfaces, for observability.
 * @property {number} disambiguated - Collisions recovered by the opt-in disambiguation pass (0 unless disambiguate=true).
 * @property {boolean} dry_run - Echoes the request flag.
 * @property {string} workspace_id - Echoed scope context.
 * @property {string} user_id - Echoed scope context.
 */

/**
 * Report returned by {@link GraphAPI#dedupEntities}.
 * @typedef {Object} EntityDedupReport
 * @property {number} merged_clusters - Same-name fragment (sub-)clusters collapsed into one surviving node.
 * @property {number} merged_nodes - Total fragment nodes merged away (cluster size minus the survivor, summed).
 * @property {number} redirected_edges - External edges moved from merged-away nodes onto survivors (0 when dry_run).
 * @property {number} abstained_clusters - Same-name clusters left untouched (no confident identity tier — the disjoint-edge tail).
 * @property {boolean} dry_run - Echoes the request flag.
 * @property {string} workspace_id - Echoed scope context.
 * @property {string} user_id - Echoed scope context.
 */

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

  /**
   * Merge unambiguous single-token entity aliases ("Hudson") into their
   * multi-token canonical ("Rock Hudson") over the caller's workspace graph,
   * abstaining on collisions (>=2 canonical candidates).
   *
   * `dry_run` is a query parameter (matching the /clustering/run precedent),
   * not a JSON body — POST .../resolve-aliases?dry_run=true.
   *
   * @param {Object} [options]
   * @param {boolean} [options.dryRun=false] - Compute the resolve/abstain plan and report counts without mutating the graph.
   * @param {boolean} [options.disambiguate=false] - Opt-in (CORE-GRAPH-ALIAS-DISAMBIG-1): additionally recover colliding surfaces by structural typed-neighbor overlap, merging only on a confident, clear winner (never mis-merge). Extractor-dependent; helps LLM-extracted graphs.
   * @returns {Promise<AliasResolveReport>}
   */
  async resolveAliases({ dryRun = false, disambiguate = false } = {}) {
    return this.api.post(`/memory/graph/resolve-aliases?dry_run=${dryRun}&disambiguate=${disambiguate}`);
  }

  /**
   * Dedup cross-extractor fragmented entity nodes (CORE-GRAPH-CANONICAL-DEDUP-1).
   *
   * Collapses same-name entity-node fragments (the same entity split across >1 node because two
   * extractors disagreed on its type -> divergent canonical_key -> the write-time dedup missed them)
   * into one node, precision-first, over the caller's workspace graph. Unblocks ensemble alias
   * disambiguation. Opt-in, default-off. Recommended ensemble sequence: dedupEntities() then
   * resolveAliases({ disambiguate: true }).
   *
   * Both flags are query parameters, not a JSON body — POST .../dedup-entities?dry_run=true.
   *
   * @param {Object} [options]
   * @param {boolean} [options.dryRun=false] - Compute the dedup plan and report counts without mutating the graph.
   * @param {boolean} [options.requireStructuralConfirmation=true] - When true, a same-name pair merges only on T0 (same QID), T1 (same canonical_key), or T2 (>= tau_min shared typed entity-neighbors). When false, exact same-name clusters merge on name alone once T0/T1 fail (riskier disjoint-edge-tail recovery).
   * @returns {Promise<EntityDedupReport>}
   */
  async dedupEntities({ dryRun = false, requireStructuralConfirmation = true } = {}) {
    return this.api.post(
      `/memory/graph/dedup-entities?dry_run=${dryRun}&require_structural_confirmation=${requireStructuralConfirmation}`
    );
  }
}
