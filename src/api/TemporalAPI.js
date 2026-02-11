/**
 * Temporal API - Bi-temporal queries, version history, audit trails, and compliance.
 *
 * Covers all endpoints from temporal.py:
 *   GET  /memory/temporal/{item_id}/history
 *   GET  /memory/temporal/at/{timestamp}
 *   GET  /memory/temporal/{item_id}/at/{timestamp}
 *   GET  /memory/temporal/{item_id}/changes
 *   POST /memory/temporal/{item_id}/compare
 *   POST /memory/temporal/{item_id}/rollback
 *   GET  /memory/temporal/{item_id}/audit
 *   GET  /memory/temporal/search/during
 *   GET  /memory/temporal/compliance/report
 *   GET  /memory/temporal/relationships/{rel_id}/history
 *   GET  /memory/temporal/relationships/at/{timestamp}
 *   GET  /memory/temporal/relationships/{rel_id}/valid-periods
 */
export class TemporalAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  // === VERSION HISTORY ===

  /**
   * Get complete version history of a memory item.
   * @param {string} itemId
   * @param {Object} [options]
   * @param {string} [options.startTime] - ISO start time
   * @param {string} [options.endTime] - ISO end time
   * @param {number} [options.limit=100]
   */
  async getHistory(itemId, { startTime = null, endTime = null, limit = 100 } = {}) {
    let url = `/memory/temporal/${itemId}/history?limit=${limit}`;
    if (startTime) url += `&start_time=${startTime}`;
    if (endTime) url += `&end_time=${endTime}`;
    return this.api.get(url);
  }

  // === TIME-TRAVEL QUERIES ===

  /**
   * Time-travel query - get state at specific time.
   * @param {string} timestamp - ISO timestamp
   * @param {Object} [options]
   * @param {string} [options.query]
   * @param {number} [options.limit=100]
   */
  async timeTravel(timestamp, { query = null, limit = 100 } = {}) {
    let url = `/memory/temporal/at/${timestamp}?limit=${limit}`;
    if (query) url += `&query=${encodeURIComponent(query)}`;
    return this.api.get(url);
  }

  /**
   * Get specific item as it existed at timestamp.
   * @param {string} itemId
   * @param {string} timestamp - ISO timestamp
   */
  async getItemAtTime(itemId, timestamp) {
    return this.api.get(`/memory/temporal/${itemId}/at/${timestamp}`);
  }

  // === CHANGE TRACKING ===

  /**
   * Get all changes to an item in time range.
   * @param {string} itemId
   * @param {Object} [options]
   * @param {string} [options.since]
   * @param {string} [options.until]
   * @param {string} [options.changeType]
   */
  async getChanges(itemId, { since = null, until = null, changeType = null } = {}) {
    let url = `/memory/temporal/${itemId}/changes`;
    const params = [];
    if (since) params.push(`since=${since}`);
    if (until) params.push(`until=${until}`);
    if (changeType) params.push(`change_type=${changeType}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.api.get(url);
  }

  // === VERSION COMPARISON ===

  /**
   * Compare two versions of an item.
   * @param {string} itemId
   * @param {number} v1
   * @param {number} v2
   */
  async compareVersions(itemId, v1, v2) {
    return this.api.post(`/memory/temporal/${itemId}/compare?v1=${v1}&v2=${v2}`);
  }

  // === ROLLBACK ===

  /**
   * Rollback item to previous version or timestamp.
   * @param {string} itemId
   * @param {Object} [options]
   * @param {number} [options.toVersion]
   * @param {string} [options.toTime]
   */
  async rollback(itemId, { toVersion = null, toTime = null } = {}) {
    let url = `/memory/temporal/${itemId}/rollback`;
    const params = [];
    if (toVersion !== null) params.push(`to_version=${toVersion}`);
    if (toTime) params.push(`to_time=${toTime}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.api.post(url);
  }

  // === AUDIT TRAIL ===

  /**
   * Get complete audit trail for an item.
   * @param {string} itemId
   * @param {Object} [options]
   * @param {string} [options.changeType]
   * @param {string} [options.userId]
   * @param {string} [options.startTime]
   * @param {string} [options.endTime]
   */
  async getAuditTrail(itemId, { changeType = null, userId = null, startTime = null, endTime = null } = {}) {
    let url = `/memory/temporal/${itemId}/audit`;
    const params = [];
    if (changeType) params.push(`change_type=${changeType}`);
    if (userId) params.push(`user_id=${userId}`);
    if (startTime) params.push(`start_time=${startTime}`);
    if (endTime) params.push(`end_time=${endTime}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.api.get(url);
  }

  // === TEMPORAL SEARCH ===

  /**
   * Search memories that existed during time range.
   * @param {string} query
   * @param {string} startTime
   * @param {string} endTime
   * @param {number} [limit=100]
   */
  async searchDuringRange(query, startTime, endTime, limit = 100) {
    const qs = new URLSearchParams({
      query,
      start_time: startTime,
      end_time: endTime,
      limit: String(limit)
    }).toString();
    return this.api.get(`/memory/temporal/search/during?${qs}`);
  }

  // === COMPLIANCE REPORTING ===

  /**
   * Generate compliance report (HIPAA, GDPR, SOC2).
   * @param {string} startDate
   * @param {string} endDate
   * @param {Object} [options]
   * @param {string} [options.reportType='HIPAA']
   * @param {string[]} [options.itemIds]
   */
  async complianceReport(startDate, endDate, { reportType = 'HIPAA', itemIds = null } = {}) {
    let url = `/memory/temporal/compliance/report?start_date=${startDate}&end_date=${endDate}&report_type=${reportType}`;
    if (itemIds && itemIds.length) {
      for (const id of itemIds) {
        url += `&item_ids=${encodeURIComponent(id)}`;
      }
    }
    return this.api.get(url);
  }

  // === TEMPORAL RELATIONSHIPS ===

  /**
   * Get history of a relationship.
   * @param {string} relId
   */
  async getRelationshipHistory(relId) {
    return this.api.get(`/memory/temporal/relationships/${relId}/history`);
  }

  /**
   * Get all relationships that existed at specific time.
   * @param {string} timestamp
   * @param {number} [limit=100]
   */
  async getRelationshipsAtTime(timestamp, limit = 100) {
    return this.api.get(`/memory/temporal/relationships/at/${timestamp}?limit=${limit}`);
  }

  /**
   * Get valid time periods for a relationship.
   * @param {string} relId
   */
  async getRelationshipValidPeriods(relId) {
    return this.api.get(`/memory/temporal/relationships/${relId}/valid-periods`);
  }
}
