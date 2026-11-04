/**
 * Learned API - lessons learned and constraints (SM-LEARNED-TOOLS-1).
 *
 * Covers:
 *   POST /memory/learned
 *   POST /memory/constraints
 *
 * The workspace comes from the auth context, never the body: there is no `scope` or
 * `workspaceId` option. Read the rows back with `client.recall.pack` and the sections
 * `learned` and `constraints` (an expired constraint is left out).
 *
 * Contract: smart-memory-docs docs/features/SM-LEARNED-TOOLS-1/contract.json
 */
export class LearnedAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Record a lesson learned.
   * @param {string} content - The lesson (required).
   * @param {Object} [opts]
   * @param {string} [opts.category] - Free-form category tag.
   * @param {string} [opts.incidentLink] - The incident or ticket the lesson came from.
   * @param {'repo'|'workspace'|'global'} [opts.learnedScope] - Where it applies.
   * @returns {Promise<Object>} `{ item_id, learned_id, content, category, incident_link, learned_scope }`.
   */
  async addLearning(content, opts = {}) {
    const body = { content };
    if (opts.category !== undefined) body.category = opts.category;
    if (opts.incidentLink !== undefined) body.incident_link = opts.incidentLink;
    if (opts.learnedScope !== undefined) body.learned_scope = opts.learnedScope;
    return this.api.post('/memory/learned', body);
  }

  /**
   * Record a constraint (a hard limit).
   * @param {string} content - The constraint (required).
   * @param {Object} [opts]
   * @param {string} [opts.domain] - Its area (compliance, security, infra, release, ...).
   * @param {string} [opts.source] - Who or what set it.
   * @param {string} [opts.expiresAt] - ISO-8601 time after which it no longer applies
   *   (a naive time is read as UTC).
   * @returns {Promise<Object>} `{ item_id, constraint_id, content, domain, source, expires_at }`.
   */
  async addConstraint(content, opts = {}) {
    const body = { content };
    if (opts.domain !== undefined) body.domain = opts.domain;
    if (opts.source !== undefined) body.source = opts.source;
    if (opts.expiresAt !== undefined) body.expires_at = opts.expiresAt;
    return this.api.post('/memory/constraints', body);
  }
}
