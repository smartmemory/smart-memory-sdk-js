/**
 * Opinion API - Opinion lifecycle endpoints.
 *
 * Currently covers:
 *   POST /memory/opinions/create
 *
 * `agentId` is auto-populated server-side from the request scope when the
 * caller is an agent-typed user (CORE-AGENT-ATTRIBUTION-1); pass it
 * explicitly to override.
 */
export class OpinionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Create a new opinion with optional agent attribution.
   * @param {string} content - Opinion content (required).
   * @param {Object} [opts]
   * @param {number} [opts.confidence] - Initial confidence (0..1).
   * @param {string} [opts.subject] - What the opinion is about.
   * @param {string} [opts.subjectType] - Type tag for the subject.
   * @param {Object} [opts.disposition] - Disposition payload.
   * @param {string[]} [opts.formedFrom] - Source memory ids that formed it.
   * @param {string} [opts.domain] - Domain tag for filtered retrieval.
   * @param {string} [opts.agentId] - Producing agent id; omit to let the
   *   server auto-populate from scope.resolve_agent_id().
   */
  async createOpinion(content, opts = {}) {
    const body = { content };
    if (opts.confidence !== undefined) body.confidence = opts.confidence;
    if (opts.subject !== undefined) body.subject = opts.subject;
    if (opts.subjectType !== undefined) body.subject_type = opts.subjectType;
    if (opts.disposition !== undefined) body.disposition = opts.disposition;
    if (opts.formedFrom !== undefined) body.formed_from = opts.formedFrom;
    if (opts.domain !== undefined) body.domain = opts.domain;
    if (opts.agentId !== undefined) body.agent_id = opts.agentId;
    return this.api.post('/memory/opinions/create', body);
  }
}
