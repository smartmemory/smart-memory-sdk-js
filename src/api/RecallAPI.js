/**
 * Recall API — Budgeted context packing (CORE-RECALL-BUDGET-1).
 *
 * Covers the one endpoint from `recall.py`:
 *   POST   /memory/recall/pack
 *
 * See `docs/features/CORE-RECALL-BUDGET-1/recall-pack-contract.json` for the
 * canonical request / response shapes.
 */
export class RecallAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Assemble one priority-ordered context block within a token budget.
   * @param {Object} params
   * @param {number} params.budgetTokens Token budget for the packed block.
   * @param {string} [params.query] Query to rank items by relevance; omit for
   *   tier + recency ranking.
   * @param {Array<Object>} [params.sections] Overrides the default section
   *   list/order/caps. Each entry is `{ name, cap_tokens }` on the wire;
   *   callers may pass either `cap_tokens` or camelCase `capTokens` and it
   *   will be normalized to `cap_tokens`.
   * @param {string} [params.preset] Named section set, used instead of
   *   `sections`. `'wakeup'` is the session-start L1 card (active plan, anchors,
   *   workspace topics, last-session headline) — pass it with a small budget
   *   (~300 tokens); the default sections go degenerate at that size, and the card
   *   is content-bounded so a typical workspace renders far under it. Passing
   *   both `preset` and `sections` is rejected with a 400.
   *
   * `null` and `undefined` are treated identically for both optional params and
   * omitted from the wire body. `null` is what you get from `JSON.parse`, from a
   * default-valued config object, or from a caller spreading a partially-filled
   * options object — and `sections: null` previously reached `null.map(...)` and
   * threw. Omitting also matches the Python SDK and the MCP remote backend, so one
   * body shape reaches the route from every client.
   * @returns {Promise<Object>} RecallPack — `{ block, manifest }`.
   */
  async pack({ budgetTokens, query, sections, preset } = {}) {
    const body = { budget_tokens: budgetTokens };
    if (query !== undefined && query !== null) body.query = query;
    if (sections !== undefined && sections !== null) {
      body.sections = sections.map(({ name, cap_tokens: capTokensSnake, capTokens }) => ({
        name,
        cap_tokens: capTokensSnake !== undefined ? capTokensSnake : capTokens,
      }));
    }
    if (preset !== undefined && preset !== null) body.preset = preset;
    return this.api.post('/memory/recall/pack', body);
  }
}
