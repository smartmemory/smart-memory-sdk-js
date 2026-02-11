export class TokenUsageAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Get aggregated token usage history for the current workspace.
   * @param {Object} params - Query parameters
   * @param {string} [params.start_date] - ISO date string (inclusive)
   * @param {string} [params.end_date] - ISO date string (inclusive)
   * @param {string} [params.group_by] - Group by: "stage" | "profile" | "day"
   * @param {number} [params.limit=100] - Max records (1-1000)
   */
  async getUsage(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.api.get(`/memory/token-usage${qs ? '?' + qs : ''}`);
  }

  /**
   * Get real-time token usage: cache stats + last 10 pipeline runs.
   */
  async getCurrent() {
    return this.api.get('/memory/token-usage/current');
  }
}
