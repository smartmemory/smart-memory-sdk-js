/**
 * Pattern API - adherence pattern catalog (CORE-ADHERENCE-1; writes SM-PATTERN-CRUD-1).
 *
 * Covers:
 *   GET    /memory/patterns
 *   GET    /memory/patterns/{pattern_id}
 *   POST   /memory/patterns
 *   PUT    /memory/patterns/{pattern_id}
 *   DELETE /memory/patterns/{pattern_id}   (retire: soft retraction, status 'retracted')
 *   POST   /memory/patterns/seed           (MEMORY.md text, never a path)
 *
 * Contract: smart-memory-docs docs/features/CORE-ADHERENCE-1/pattern-contract.json.
 */
export class PatternAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * List active patterns.
   * @param {Object} [opts]
   * @param {string} [opts.scope] - Glob/path fragment filter.
   * @param {'info'|'warn'|'error'} [opts.severity]
   * @param {string} [opts.q] - Free-text substring filter.
   * @param {number} [opts.limit=100]
   */
  async list(opts = {}) {
    const query = { limit: String(opts.limit ?? 100) };
    if (opts.scope !== undefined) query.scope = opts.scope;
    if (opts.severity !== undefined) query.severity = opts.severity;
    if (opts.q !== undefined) query.q = opts.q;
    return this.api.get(`/memory/patterns?${new URLSearchParams(query).toString()}`);
  }

  /** Get one pattern by id (404 when absent in this workspace). */
  async get(patternId) {
    return this.api.get(`/memory/patterns/${encodeURIComponent(patternId)}`);
  }

  /**
   * Create a pattern in the current workspace.
   * @param {Object} params
   * @param {string} params.title
   * @param {string} params.content - One-line rule statement.
   * @param {'info'|'warn'|'error'} [params.severity='warn']
   * @param {string[]} [params.scope=[]]
   * @param {Array<{kind: 'positive'|'negative', code: string, note?: string}>} [params.examples=[]]
   * @param {string} [params.rationale='']
   * @param {string} [params.source='user']
   */
  async create({ title, content, severity = 'warn', scope = [], examples = [], rationale = '', source = 'user' }) {
    return this.api.post('/memory/patterns', { title, content, severity, scope, examples, rationale, source });
  }

  /**
   * Change fields on an active pattern; the server bumps `version` and records `updated_by`.
   * Pass snake_case contract fields (title, content, severity, scope, examples, rationale, source,
   * updated_by). A protected field (pattern_id, status, superseded_by, created_at) is a 422.
   */
  async update(patternId, fields) {
    return this.api.put(`/memory/patterns/${encodeURIComponent(patternId)}`, fields);
  }

  /** Retire (soft-delete) a pattern: status becomes 'retracted'. */
  async retire(patternId, reason = 'retired via SDK') {
    return this.api.delete(
      `/memory/patterns/${encodeURIComponent(patternId)}?reason=${encodeURIComponent(reason)}`
    );
  }

  /**
   * Seed patterns from MEMORY.md TEXT.
   * @param {string} indexText - The MEMORY.md text.
   * @param {Object} [opts]
   * @param {Object<string, string>} [opts.files={}] - Link as written in the index -> file text.
   * @param {Object<string, string>} [opts.refused={}] - Link -> reason the caller declined to read it.
   * @param {string} [opts.sourcePrefix='memory_md']
   * @returns {Promise<{created: string[], skipped: Array<{title: string, link: string, reason: string}>}>}
   */
  async seed(indexText, opts = {}) {
    return this.api.post('/memory/patterns/seed', {
      index_text: indexText,
      files: opts.files ?? {},
      refused: opts.refused ?? {},
      source_prefix: opts.sourcePrefix ?? 'memory_md'
    });
  }
}
