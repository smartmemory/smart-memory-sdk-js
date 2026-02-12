export class ProcedureMatchAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * List procedure match history for the current workspace.
   * @param {Object} params - Query parameters
   * @param {string} [params.start_date] - ISO date string (inclusive)
   * @param {string} [params.end_date] - ISO date string (inclusive)
   * @param {string} [params.procedure_id] - Filter by procedure ID
   * @param {string} [params.feedback] - Filter by feedback: "success" | "failure" | "neutral"
   * @param {number} [params.limit=100] - Max records (1-1000)
   */
  async list(params = {}) {
    const filtered = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v != null)
    );
    const qs = new URLSearchParams(filtered).toString();
    return this.api.get(`/memory/procedure-matches${qs ? '?' + qs : ''}`);
  }

  /**
   * Submit feedback for a procedure match.
   * @param {string} matchId - The match ID (uuid)
   * @param {string} feedback - One of "success", "failure", "neutral"
   * @param {string} [note] - Optional explanation
   */
  async submitFeedback(matchId, feedback, note = null) {
    const body = { feedback };
    if (note) body.note = note;
    return this.api.post(`/memory/procedure-matches/${matchId}/feedback`, body);
  }

  /**
   * Get aggregated procedure match statistics.
   */
  async getStats() {
    return this.api.get('/memory/procedure-matches/stats');
  }
}
