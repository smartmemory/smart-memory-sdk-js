/**
 * Summary API — Memory snapshot lifecycle (CORE-SUMMARY-1, E2).
 *
 * Covers the seven endpoints from `summary.py`:
 *   POST   /memory/summary/generate
 *   GET    /memory/summary/latest
 *   GET    /memory/summary/list
 *   GET    /memory/summary/delta
 *   GET    /memory/summary/{snapshot_id}
 *   GET    /memory/summary/{snapshot_id}/markdown
 *   DELETE /memory/summary/{snapshot_id}
 *
 * See `docs/features/CORE-SUMMARY-1/snapshot-contract.json` for the
 * canonical request / response shapes.
 */
export class SummaryAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Fire a manual snapshot for the current workspace.
   * Throws on 409 lock_held — concurrent /generate from the same workspace.
   * @param {Object} [params]
   * @param {string} [params.windowStart] ISO 8601 datetime string
   * @param {boolean} [params.includeMarkdown=true]
   */
  async generate({ windowStart = null, includeMarkdown = true } = {}) {
    return this.api.post('/memory/summary/generate', {
      window_start: windowStart,
      include_markdown: includeMarkdown,
    });
  }

  /** Most recent snapshot for the current workspace, or null on 404. */
  async latest() {
    try {
      return await this.api.get('/memory/summary/latest');
    } catch (e) {
      if (e?.status === 404) return null;
      throw e;
    }
  }

  /** Specific snapshot by id, or null on 404. */
  async get(snapshotId) {
    try {
      return await this.api.get(`/memory/summary/${snapshotId}`);
    } catch (e) {
      if (e?.status === 404) return null;
      throw e;
    }
  }

  /** Fast-path graph-only markdown for a snapshot. */
  async getMarkdown(snapshotId) {
    try {
      return await this.api.get(`/memory/summary/${snapshotId}/markdown`);
    } catch (e) {
      if (e?.status === 404) return null;
      throw e;
    }
  }

  /**
   * List snapshots for the current workspace, newest first.
   * @param {Object} [params]
   * @param {boolean|null} [params.isHeartbeat]
   * @param {number} [params.limit=20]
   * @param {string} [params.before] ISO 8601 datetime
   */
  async list({ isHeartbeat = null, limit = 20, before = null } = {}) {
    const query = { limit };
    if (isHeartbeat !== null) query.is_heartbeat = isHeartbeat;
    if (before !== null) query.before = before;
    return this.api.get('/memory/summary/list', query);
  }

  /** SnapshotDelta between two snapshots. Returns null on 404. */
  async delta({ from: fromId, to: toId }) {
    try {
      return await this.api.get('/memory/summary/delta', {
        from: fromId,
        to: toId,
      });
    } catch (e) {
      if (e?.status === 404) return null;
      throw e;
    }
  }

  /** Admin-only delete. Throws on 403/404/500. */
  async delete(snapshotId) {
    return this.api.delete(`/memory/summary/${snapshotId}`);
  }
}
