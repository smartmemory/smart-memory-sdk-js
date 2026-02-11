/**
 * Validation API - Memory item validation, graph health, and inference engine.
 *
 * Covers all endpoints from validation.py:
 *   GET  /memory/validation/health
 *   POST /memory/validation/validate
 *   POST /memory/validation/inference
 *   GET  /memory/validation/inference/rules
 */
export class ValidationAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Get graph health metrics: orphan ratio, type distribution, provenance coverage.
   */
  async getHealth() {
    return this.api.get('/memory/validation/health');
  }

  /**
   * Validate a memory item against schema and semantic rules.
   * @param {string} itemId
   */
  async validateItem(itemId) {
    return this.api.post('/memory/validation/validate', {
      item_id: itemId
    });
  }

  /**
   * Run inference engine to create inferred edges from rules.
   * @param {Object} [options]
   * @param {boolean} [options.dryRun=false]
   */
  async runInference({ dryRun = false } = {}) {
    return this.api.post('/memory/validation/inference', {
      dry_run: dryRun
    });
  }

  /**
   * List available inference rules.
   */
  async getInferenceRules() {
    return this.api.get('/memory/validation/inference/rules');
  }
}
