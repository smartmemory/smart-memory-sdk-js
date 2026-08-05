/**
 * Sequence API — workspace-scoped monotonic allocation (SVC-ALLOC-1).
 *
 * Covers the two endpoints from `sequences.py`:
 *   POST /memory/sequences/{name}/next
 *   GET  /memory/sequences/{name}
 *
 * See `smart-memory-docs/docs/features/SVC-ALLOC-1/sequence-contract.json` for
 * the canonical request / response shapes.
 *
 * This is the successor to the lease for allocation specifically: `$inc` is
 * atomic, so concurrent callers get distinct numbers with no lock. Do NOT wrap
 * these calls in a lease. The lease is still required for read-modify-write.
 */
export class SequenceAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Consume the next numbers. The caller owns the inclusive range [first, value].
   *
   * Every non-2xx throws. Unlike the lease there is no benign failure to
   * swallow — returning null on a 503 would let a caller mistake coordinator
   * failure for an allocation, which is the one thing this primitive prevents.
   *
   * Numbers you do not use are LOST. There is no release and no reclaim; gaps
   * are guaranteed, so never treat `value` as a record count.
   *
   * @param {string} name
   * @param {Object} [params]
   * @param {number} [params.floor] High-water mark. Applied with `$max`, so it
   *   can only ever raise the counter — safe and idempotent to send every call.
   * @param {number} [params.count] How many to allocate (1..100, default 1).
   * @returns {Promise<{name: string, value: number, first: number, count: number}>}
   */
  async allocate(name, { floor, count } = {}) {
    const body = {};
    // Explicit undefined checks: `floor` of 0 is falsy but meaningful.
    if (floor !== undefined) body.floor = floor;
    if (count !== undefined) body.count = count;

    return this.api.post(`/memory/sequences/${name}/next`, body);
  }

  /**
   * Read the counter without consuming a number, or null if never allocated.
   *
   * Only a 404 becomes null. A 503 throws — a down coordinator is not the same
   * answer as "this sequence does not exist".
   *
   * @param {string} name
   * @returns {Promise<number|null>}
   */
  async peek(name) {
    try {
      const result = await this.api.get(`/memory/sequences/${name}`);
      return result?.value ?? null;
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
  }
}
