/**
 * Analytics API - Concept drift detection and bias analysis.
 *
 * Covers all endpoints from analytics.py:
 *   GET  /memory/analytics/status
 *   GET  /memory/analytics/drift
 *   POST /memory/analytics/bias
 */
export class AnalyticsAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Get analytics feature status and environment capabilities.
   */
  async getStatus() {
    return this.api.get('/memory/analytics/status');
  }

  /**
   * Run concept drift detection over the specified time window.
   * @param {number} [timeWindowDays=30]
   */
  async detectDrift(timeWindowDays = 30) {
    return this.api.get(`/memory/analytics/drift?time_window_days=${timeWindowDays}`);
  }

  /**
   * Run bias detection with optional sentiment/topic analysis.
   * @param {Object} [options]
   * @param {string[]} [options.protectedAttributes]
   * @param {boolean} [options.sentimentAnalysis]
   * @param {boolean} [options.topicAnalysis]
   */
  async detectBias({ protectedAttributes = null, sentimentAnalysis = null, topicAnalysis = null } = {}) {
    const body = {};
    if (protectedAttributes !== null) body.protected_attributes = protectedAttributes;
    if (sentimentAnalysis !== null) body.sentiment_analysis = sentimentAnalysis;
    if (topicAnalysis !== null) body.topic_analysis = topicAnalysis;
    return this.api.post('/memory/analytics/bias', body);
  }
}
