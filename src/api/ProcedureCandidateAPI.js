const PROMOTE_OPTIONS = ['name', 'description', 'procedure_type', 'preferred_profile'];

export class ProcedureCandidateAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * List procedure promotion candidates detected from working memory patterns.
   * @param {Object} params - Query parameters
   * @param {number} [params.min_score=0.6] - Minimum recommendation score (0-1)
   * @param {number} [params.min_cluster_size=3] - Minimum items in cluster
   * @param {number} [params.days_back=30] - Days to look back
   * @param {number} [params.limit=20] - Max candidates to return
   * @returns {Promise<Object>} Response containing candidates array
   */
  async list(params = {}) {
    const filtered = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v != null)
    );
    const qs = new URLSearchParams(filtered).toString();
    return this.api.get(`/memory/procedures/candidates${qs ? '?' + qs : ''}`);
  }

  /**
   * Promote a candidate cluster to a new procedure.
   * @param {string} clusterId - The cluster ID from list()
   * @param {Object} options - Promotion options
   * @param {string} [options.name] - Name for the procedure (uses suggested_name if omitted)
   * @param {string} [options.description] - Description for the procedure
   * @param {string} [options.procedure_type='extraction'] - Type of procedure
   * @param {string} [options.preferred_profile='quick_extract'] - Pipeline profile
   * @returns {Promise<Object>} Response with procedure_id and status
   * @throws {TypeError} on an option not listed above. Promotion never deletes its source working
   *   items (G129), so a removed option fails loudly instead of being ignored.
   */
  async promote(clusterId, options = {}) {
    for (const key of Object.keys(options)) {
      if (!PROMOTE_OPTIONS.includes(key)) {
        throw new TypeError(`promote() has no option '${key}' (promotion never removes its source items)`);
      }
    }
    const body = {
      name: options.name ?? null,
      description: options.description ?? null,
      procedure_type: options.procedure_type ?? 'extraction',
      preferred_profile: options.preferred_profile ?? 'quick_extract',
    };
    return this.api.post(`/memory/procedures/candidates/${clusterId}/promote`, body);
  }

  /**
   * Dismiss a candidate cluster from future recommendations.
   * @param {string} clusterId - The cluster ID to dismiss
   * @returns {Promise<Object>} Response with status and message
   */
  async dismiss(clusterId) {
    return this.api.delete(`/memory/procedures/candidates/${clusterId}/dismiss`);
  }
}
