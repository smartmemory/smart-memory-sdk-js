/**
 * Lease API — scoped, renewable coordination leases (SVC-LEASE-1).
 *
 * Covers the three endpoints from `locks.py`:
 *   POST   /memory/locks/{key}
 *   POST   /memory/locks/{key}/renew
 *   DELETE /memory/locks/{key}
 *
 * See `smart-memory-docs/docs/features/SVC-LEASE-1/lease-contract.json` for
 * the canonical request / response shapes.
 */
export class LockAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Acquire a lease, or return null when a live holder definitively owns it.
   * @param {string} key
   * @param {Object} [params]
   * @param {number} [params.ttlSeconds]
   * @returns {Promise<{key: string, token: string, expires_at: string, ttl_remaining_ms: number}|null>}
   */
  async acquire(key, { ttlSeconds } = {}) {
    const body = {};
    if (ttlSeconds !== undefined) body.ttl_seconds = ttlSeconds;

    try {
      return await this.api.post(`/memory/locks/${key}`, body);
    } catch (error) {
      if (error?.status === 409 && error.detail?.detail?.reason === 'lock_held') {
        // Only a recognised 409 is a definitive "not ours" result. A 503,
        // network failure, or any other error is unknown and must raise so a
        // caller never mistakes coordinator uncertainty for ordinary contention.
        return null;
      }
      throw error;
    }
  }

  /**
   * Renew a lease, or return null when this token definitively no longer owns it.
   * @param {string} key
   * @param {string} token
   * @param {Object} [params]
   * @param {number} [params.ttlSeconds]
   * @returns {Promise<{key: string, token: string, expires_at: string, ttl_remaining_ms: number}|null>}
   */
  async renew(key, token, { ttlSeconds } = {}) {
    const body = {};
    if (ttlSeconds !== undefined) body.ttl_seconds = ttlSeconds;

    try {
      return await this.api.post(`/memory/locks/${key}/renew`, body, {
        headers: { 'X-Lease-Token': token },
      });
    } catch (error) {
      if (error?.status === 409 && error.detail?.detail?.reason === 'not_owner') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Release a lease. Returns false when this token definitively no longer owns it.
   * @param {string} key
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async release(key, token) {
    try {
      await this.api.delete(`/memory/locks/${key}`, {
        headers: { 'X-Lease-Token': token },
      });
      return true;
    } catch (error) {
      if (error?.status === 409 && error.detail?.detail?.reason === 'not_owner') {
        return false;
      }
      throw error;
    }
  }
}
