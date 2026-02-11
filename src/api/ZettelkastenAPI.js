/**
 * Zettelkasten API - Bidirectional linking, emergent structure, and discovery.
 *
 * Covers all endpoints from zettelkasten.py:
 *   GET  /memory/zettel/{note_id}/backlinks
 *   GET  /memory/zettel/{note_id}/forward-links
 *   GET  /memory/zettel/{note_id}/connections
 *   GET  /memory/zettel/clusters
 *   GET  /memory/zettel/hubs
 *   GET  /memory/zettel/bridges
 *   GET  /memory/zettel/{note_id}/discoveries
 *   GET  /memory/zettel/{note_id}/path/{target_id}
 *   POST /memory/zettel/wikilink/parse
 *   GET  /memory/zettel/wikilink/resolve
 *   GET  /memory/zettel/{note_id}/graph
 *   GET  /memory/zettel/concept-emergence
 *   GET  /memory/zettel/{note_id}/suggestions
 *   GET  /memory/zettel/{note_id}/random-walk
 *   GET  /memory/zettel/by-tag/{tag}
 *   GET  /memory/zettel/by-property
 *   GET  /memory/zettel/mentioning/{entity_id}
 *   GET  /memory/zettel/by-relation/{source_id}/{relation_type}
 */
export class ZettelkastenAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  // === BIDIRECTIONAL LINKING ===

  /**
   * Get notes that link TO this note (backlinks).
   * @param {string} noteId
   */
  async getBacklinks(noteId) {
    return this.api.get(`/memory/zettel/${noteId}/backlinks`);
  }

  /**
   * Get notes this note links TO (forward links).
   * @param {string} noteId
   */
  async getForwardLinks(noteId) {
    return this.api.get(`/memory/zettel/${noteId}/forward-links`);
  }

  /**
   * Get all connections (backlinks + forward links).
   * @param {string} noteId
   */
  async getConnections(noteId) {
    return this.api.get(`/memory/zettel/${noteId}/connections`);
  }

  // === EMERGENT STRUCTURE ===

  /**
   * Detect knowledge clusters in your Zettelkasten.
   * @param {Object} [options]
   * @param {number} [options.minSize=3]
   * @param {string} [options.algorithm='louvain']
   */
  async getClusters({ minSize = 3, algorithm = 'louvain' } = {}) {
    return this.api.get(`/memory/zettel/clusters?min_size=${minSize}&algorithm=${algorithm}`);
  }

  /**
   * Find hub notes (highly connected notes).
   * @param {Object} [options]
   * @param {number} [options.minConnections=5]
   * @param {number} [options.limit=20]
   */
  async getHubs({ minConnections = 5, limit = 20 } = {}) {
    return this.api.get(`/memory/zettel/hubs?min_connections=${minConnections}&limit=${limit}`);
  }

  /**
   * Find bridge notes (notes connecting different clusters).
   * @param {number} [limit=20]
   */
  async getBridges(limit = 20) {
    return this.api.get(`/memory/zettel/bridges?limit=${limit}`);
  }

  // === SERENDIPITOUS DISCOVERY ===

  /**
   * Find unexpected connections (serendipitous discovery).
   * @param {string} noteId
   * @param {Object} [options]
   * @param {number} [options.maxDistance=3]
   * @param {number} [options.minSurprise=0.5]
   */
  async getDiscoveries(noteId, { maxDistance = 3, minSurprise = 0.5 } = {}) {
    return this.api.get(`/memory/zettel/${noteId}/discoveries?max_distance=${maxDistance}&min_surprise=${minSurprise}`);
  }

  /**
   * Find paths between two notes.
   * @param {string} noteId
   * @param {string} targetId
   * @param {number} [maxPaths=5]
   */
  async getPath(noteId, targetId, maxPaths = 5) {
    return this.api.get(`/memory/zettel/${noteId}/path/${targetId}?max_paths=${maxPaths}`);
  }

  // === WIKILINK SUPPORT ===

  /**
   * Parse [[wikilinks]] in content.
   * @param {string} content
   * @param {boolean} [autoCreate=true]
   */
  async parseWikilinks(content, autoCreate = true) {
    return this.api.post(`/memory/zettel/wikilink/parse?auto_create=${autoCreate}`, content);
  }

  /**
   * Resolve a wikilink to a note.
   * @param {string} link
   */
  async resolveWikilink(link) {
    return this.api.get(`/memory/zettel/wikilink/resolve?link=${encodeURIComponent(link)}`);
  }

  // === GRAPH VISUALIZATION ===

  /**
   * Get subgraph around a note (for visualization).
   * @param {string} noteId
   * @param {Object} [options]
   * @param {number} [options.depth=2]
   * @param {boolean} [options.includeMetadata=true]
   */
  async getSubgraph(noteId, { depth = 2, includeMetadata = true } = {}) {
    return this.api.get(`/memory/zettel/${noteId}/graph?depth=${depth}&include_metadata=${includeMetadata}`);
  }

  // === ADDITIONAL DISCOVERY ===

  /**
   * Detect emerging concepts from connection patterns.
   * @param {number} [limit=20]
   */
  async detectConceptEmergence(limit = 20) {
    return this.api.get(`/memory/zettel/concept-emergence?limit=${limit}`);
  }

  /**
   * Suggest related notes for serendipitous discovery.
   * @param {string} noteId
   * @param {number} [count=5]
   */
  async suggestRelated(noteId, count = 5) {
    return this.api.get(`/memory/zettel/${noteId}/suggestions?count=${count}`);
  }

  /**
   * Perform random walk for serendipitous discovery.
   * @param {string} noteId
   * @param {number} [length=5]
   */
  async randomWalk(noteId, length = 5) {
    return this.api.get(`/memory/zettel/${noteId}/random-walk?length=${length}`);
  }

  // === QUERY FEATURES ===

  /**
   * Find notes by tag.
   * @param {string} tag
   * @param {number} [limit=100]
   */
  async findByTag(tag, limit = 100) {
    return this.api.get(`/memory/zettel/by-tag/${encodeURIComponent(tag)}?limit=${limit}`);
  }

  /**
   * Find notes by property.
   * @param {string} key
   * @param {string} value
   * @param {number} [limit=100]
   */
  async findByProperty(key, value, limit = 100) {
    return this.api.get(`/memory/zettel/by-property?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}&limit=${limit}`);
  }

  /**
   * Find notes mentioning an entity.
   * @param {string} entityId
   * @param {number} [limit=100]
   */
  async findMentioning(entityId, limit = 100) {
    return this.api.get(`/memory/zettel/mentioning/${entityId}?limit=${limit}`);
  }

  /**
   * Query notes by dynamic relation type.
   * @param {string} sourceId
   * @param {string} relationType
   * @param {number} [limit=100]
   */
  async queryByRelation(sourceId, relationType, limit = 100) {
    return this.api.get(`/memory/zettel/by-relation/${sourceId}/${relationType}?limit=${limit}`);
  }
}
