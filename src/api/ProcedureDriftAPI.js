/**
 * Procedure Schema Drift Detection API (CFS-4).
 *
 * Manages schema drift events and snapshots for stored procedures.
 * Contract: contracts/procedure-drift.json
 */
export class ProcedureDriftAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * List drift events with optional filters.
   * @param {Object} params
   * @param {string} [params.procedure_id] - Filter by procedure
   * @param {boolean} [params.resolved] - Filter by resolution status
   * @param {boolean} [params.breaking_only] - Only breaking changes
   * @param {string} [params.start_date] - ISO 8601 range start
   * @param {string} [params.end_date] - ISO 8601 range end
   * @param {number} [params.limit=100] - Max results (1-1000)
   * @returns {Promise<{workspace_id: string, record_count: number, records: Object[]}>}
   */
  async list(params = {}) {
    const filtered = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v != null)
    );
    const qs = new URLSearchParams(filtered).toString();
    return this.api.get(`/memory/procedure-drift${qs ? '?' + qs : ''}`);
  }

  /**
   * Get a single drift event with full change details.
   * @param {string} eventId - The drift event ID
   * @returns {Promise<Object>} DriftEventDetail
   */
  async get(eventId) {
    return this.api.get(`/memory/procedure-drift/${eventId}`);
  }

  /**
   * Mark a drift event as resolved.
   * @param {string} eventId - The drift event ID
   * @param {string} [note] - Optional resolution note (max 500 chars)
   * @returns {Promise<{status: string, event_id: string, resolved: boolean}>}
   */
  async resolve(eventId, note = null) {
    const body = {};
    if (note) body.note = note;
    return this.api.post(`/memory/procedure-drift/${eventId}/resolve`, body);
  }

  /**
   * Trigger a drift sweep across all procedures in the workspace.
   * @returns {Promise<{workspace_id: string, procedures_checked: number, drift_detected: number, events_created: number}>}
   */
  async sweep() {
    return this.api.post('/memory/procedure-drift/sweep', {});
  }

  /**
   * List schema snapshots for a procedure.
   * @param {string} procedureId - The procedure ID
   * @returns {Promise<{workspace_id: string, procedure_id: string, record_count: number, snapshots: Object[]}>}
   */
  async listSnapshots(procedureId) {
    return this.api.get(`/memory/procedure-schemas/${procedureId}`);
  }
}
