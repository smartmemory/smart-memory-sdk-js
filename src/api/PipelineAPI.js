/**
 * Pipeline API - Pipeline stage execution, state, and config management.
 *
 * Covers all endpoints from pipeline.py:
 *   POST   /memory/pipeline/extraction
 *   POST   /memory/pipeline/storage
 *   POST   /memory/pipeline/linking
 *   POST   /memory/pipeline/enrichment
 *   POST   /memory/pipeline/grounding
 *   GET    /memory/pipeline/{pipeline_id}/state
 *   DELETE /memory/pipeline/{pipeline_id}
 *   DELETE /memory/pipeline/{pipeline_id}/run/{run_id}
 *   GET    /memory/pipeline/configs
 *   POST   /memory/pipeline/configs
 *   GET    /memory/pipeline/configs/{config_name}
 *   PUT    /memory/pipeline/configs/{config_name}
 *   DELETE /memory/pipeline/configs/{config_name}
 */
export class PipelineAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  // === STAGE EXECUTION ===

  /**
   * Run extraction pipeline stage.
   * @param {Object} request - ExtractionRequest
   */
  async runExtraction(request) {
    return this.api.post('/memory/pipeline/extraction', request);
  }

  /**
   * Run storage pipeline stage.
   * @param {Object} request - StorageRequest
   */
  async runStorage(request) {
    return this.api.post('/memory/pipeline/storage', request);
  }

  /**
   * Run linking pipeline stage.
   * @param {Object} request - LinkingRequest
   */
  async runLinking(request) {
    return this.api.post('/memory/pipeline/linking', request);
  }

  /**
   * Run enrichment pipeline stage.
   * @param {Object} request - EnrichmentRequest
   */
  async runEnrichment(request) {
    return this.api.post('/memory/pipeline/enrichment', request);
  }

  /**
   * Run grounding pipeline stage.
   * @param {Object} request - GroundingRequest
   */
  async runGrounding(request) {
    return this.api.post('/memory/pipeline/grounding', request);
  }

  // === STATE MANAGEMENT ===

  /**
   * Get pipeline state for a specific pipeline and optional run.
   * @param {string} pipelineId
   * @param {string} [runId]
   */
  async getState(pipelineId, runId = null) {
    let url = `/memory/pipeline/${pipelineId}/state`;
    if (runId) url += `?run_id=${encodeURIComponent(runId)}`;
    return this.api.get(url);
  }

  /**
   * Reset a pipeline, clearing its state.
   * @param {string} pipelineId
   */
  async reset(pipelineId) {
    return this.api.delete(`/memory/pipeline/${pipelineId}`);
  }

  /**
   * Clear all stage states for a specific pipeline run.
   * @param {string} pipelineId
   * @param {string} runId
   */
  async clearRun(pipelineId, runId) {
    return this.api.delete(`/memory/pipeline/${pipelineId}/run/${runId}`);
  }

  // === CONFIG MANAGEMENT ===

  /**
   * List named pipeline configs for the current workspace.
   */
  async listConfigs() {
    return this.api.get('/memory/pipeline/configs');
  }

  /**
   * Save a named pipeline config.
   * @param {Object} params
   * @param {string} params.name
   * @param {string} [params.description='']
   * @param {Object} params.config
   */
  async createConfig({ name, description = '', config }) {
    return this.api.post('/memory/pipeline/configs', {
      name,
      description,
      config
    });
  }

  /**
   * Load a named pipeline config.
   * @param {string} configName
   */
  async getConfig(configName) {
    return this.api.get(`/memory/pipeline/configs/${configName}`);
  }

  /**
   * Update an existing pipeline config.
   * @param {string} configName
   * @param {Object} params
   * @param {string} [params.name='']
   * @param {string} [params.description='']
   * @param {Object} [params.config={}]
   */
  async updateConfig(configName, { name = '', description = '', config = {} }) {
    return this.api.patch(`/memory/pipeline/configs/${configName}`, {
      name,
      description,
      config
    });
  }

  /**
   * Delete a named pipeline config.
   * @param {string} configName
   */
  async deleteConfig(configName) {
    return this.api.delete(`/memory/pipeline/configs/${configName}`);
  }
}
