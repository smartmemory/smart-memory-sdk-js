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

/**
 * Graph read/write surface.
 *
 * ## Cancellation
 *
 * Every **read** below takes an optional `{ signal }` and forwards it to `fetch`, so a
 * caller whose results went stale can cancel in flight rather than merely ignore the
 * response. An aborted read rejects with the standard `AbortError` (not an `APIError`),
 * so `err.name === 'AbortError'` is the check.
 *
 * The **writes** deliberately take no signal. Aborting a mutation only stops the client
 * from reading the response — the server may well have applied it — so a cancelled write
 * leaves the caller unable to say whether it happened. Offering a signal there would
 * advertise a guarantee HTTP cannot make.
 */
export class GraphAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Fetch a memory item's graph neighbours.
   * @param {string} itemId
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getNeighbors(itemId, options = {}) {
    return this.api.get(`/memory/${encodeURIComponent(itemId)}/neighbors`, options);
  }

  async addEdge(sourceId, targetId, relationType, properties = {}) {
    return this.api.post('/memory/edge', {
      source_id: sourceId,
      target_id: targetId,
      relation_type: relationType,
      properties
    });
  }

  /** @param {{ signal?: AbortSignal }} [options] */
  async getHealth(options = {}) {
    return this.api.get('/memory/graph/health', options);
  }

  /** @param {{ signal?: AbortSignal }} [options] */
  async getInferenceRules(options = {}) {
    return this.api.get('/memory/inference/rules', options);
  }

  async runInference({ dryRun = false } = {}) {
    return this.api.post('/memory/inference', {
      dry_run: dryRun
    });
  }

  /**
   * Find the shortest path between two graph nodes.
   * @param {string} startId
   * @param {string} endId
   * @param {number} [maxHops=5]
   * @param {{ signal?: AbortSignal }} [options]
   */
  async findShortestPath(startId, endId, maxHops = 5, options = {}) {
    return this.api.get(`/memory/graph/path?start_id=${encodeURIComponent(startId)}&end_id=${encodeURIComponent(endId)}&max_hops=${maxHops}`, options);
  }

  /**
   * Fetch the full knowledge graph.
   * @param {number} [limit] - Optional client hint; backend enforces hard cap.
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getFullGraph(limit, options = {}) {
    if (limit == null) {
      return this.api.get('/memory/graph/full', options);
    }
    return this.api.get(`/memory/graph/full?limit=${encodeURIComponent(limit)}`, options);
  }

  /**
   * Fetch edges for multiple node IDs in bulk.
   *
   * A POST, but a read — it mutates nothing, so unlike the writes below it takes a signal.
   * @param {string[]} nodeIds
   * @param {{ includeProperties?: boolean, signal?: AbortSignal }} [options]
   */
  async getEdgesBulk(nodeIds, { includeProperties = false, signal } = {}) {
    const suffix = includeProperties ? '?include_properties=true' : '';
    return this.api.post(`/memory/graph/edges${suffix}`, { node_ids: nodeIds }, signal ? { signal } : {});
  }

  /**
   * Bulk upsert graph nodes and edges, optionally replacing a node-ID prefix.
   * @param {Object} [params]
   * @param {Array<Object>} [params.nodes=[]] - Nodes with item_id, label, and properties.
   * @param {Array<Object>} [params.edges=[]] - Edges with source_id, target_id, edge_type, and properties.
   * @param {string|null} [params.deletePrefix=null] - Scoped node-ID prefix to delete before writing.
   */
  async bulkUpsert({ nodes = [], edges = [], deletePrefix = null } = {}) {
    const body = { nodes, edges };
    if (deletePrefix !== null) {
      body.delete_prefix = deletePrefix;
    }
    return this.api.post('/memory/graph/bulk', body);
  }

  /**
   * Get Wikipedia grounding status for an entity node.
   * @param {string} nodeId
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getGroundingStatus(nodeId, options = {}) {
    return this.api.get(`/memory/graph/nodes/${encodeURIComponent(nodeId)}/grounding`, options);
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
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getLinks(itemId, options = {}) {
    return this.api.get(`/memory/${encodeURIComponent(itemId)}/links`, options);
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
