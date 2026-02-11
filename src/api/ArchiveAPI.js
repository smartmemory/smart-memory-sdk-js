/**
 * Archive API - Durable artifact storage.
 *
 * Covers all endpoints from archive.py:
 *   POST /memory/archive/store
 *   GET  /memory/archive/{archive_uri}
 */
export class ArchiveAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Persist a conversation artifact and return its URI and content hash.
   * @param {Object} params
   * @param {string} params.conversationId
   * @param {Object} params.payload
   * @param {Object} [params.metadata={}]
   */
  async store({ conversationId, payload, metadata = {} }) {
    return this.api.post('/memory/archive/store', {
      conversation_id: conversationId,
      payload,
      metadata
    });
  }

  /**
   * Retrieve a previously stored archive artifact by URI.
   * @param {string} archiveUri
   */
  async get(archiveUri) {
    return this.api.get(`/memory/archive/${archiveUri}`);
  }
}
