/**
 * Evolution API - Memory evolution, dream phase, and synthesis operations.
 *
 * Covers all endpoints from evolve.py:
 *   POST /memory/evolution/trigger
 *   POST /memory/evolution/dream
 *   GET  /memory/evolution/status
 *   POST /memory/evolution/synthesize/opinions
 *   POST /memory/evolution/synthesize/observations
 *   POST /memory/evolution/reinforce/opinions
 */
export class EvolutionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Manually trigger memory evolution processes.
   */
  async trigger() {
    return this.api.post('/memory/evolution/trigger');
  }

  /**
   * Run a 'dream' phase: promote working memory to episodic/procedural.
   */
  async dream() {
    return this.api.post('/memory/evolution/dream');
  }

  /**
   * Get status of memory evolution processes.
   */
  async getStatus() {
    return this.api.get('/memory/evolution/status');
  }

  /**
   * Run opinion synthesis: detect patterns in episodic memories and form opinions.
   */
  async synthesizeOpinions() {
    return this.api.post('/memory/evolution/synthesize/opinions');
  }

  /**
   * Run observation synthesis: create entity summaries from scattered facts.
   */
  async synthesizeObservations() {
    return this.api.post('/memory/evolution/synthesize/observations');
  }

  /**
   * Run opinion reinforcement: update confidence scores based on new evidence.
   */
  async reinforceOpinions() {
    return this.api.post('/memory/evolution/reinforce/opinions');
  }
}
