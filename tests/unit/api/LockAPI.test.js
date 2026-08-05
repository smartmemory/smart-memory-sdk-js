import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LockAPI } from '../../../src/api/LockAPI.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';

const grant = {
  key: 'compose:write',
  token: 'lease-token',
  expires_at: '2026-08-05T12:00:30Z',
  ttl_remaining_ms: 30000,
};

const leaseError = (status, reason) => ({
  status,
  detail: { detail: { reason } },
});

describe('LockAPI', () => {
  let baseAPI;
  let api;

  beforeEach(() => {
    baseAPI = {
      post: vi.fn().mockResolvedValue(grant),
      delete: vi.fn().mockResolvedValue(null),
    };
    api = new LockAPI(baseAPI);
  });

  it('acquires a lease and returns the complete grant', async () => {
    await expect(api.acquire('compose:write', { ttlSeconds: 30 })).resolves.toEqual(grant);
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/locks/compose:write', {
      ttl_seconds: 30,
    });
  });

  it('returns null only for acquire 409 lock_held', async () => {
    baseAPI.post.mockRejectedValue(leaseError(409, 'lock_held'));
    await expect(api.acquire('compose:write')).resolves.toBeNull();
  });

  // A 409 is control flow only when its reason is the one THIS call models.
  // Any other 409 is an unmodelled server response and must surface rather
  // than be flattened into the "definitively not ours" sentinel.
  it('rethrows acquire 409 carrying an unexpected reason', async () => {
    const error = leaseError(409, 'not_owner');
    baseAPI.post.mockRejectedValue(error);
    await expect(api.acquire('compose:write')).rejects.toBe(error);
  });

  it('rethrows renew 409 carrying an unexpected reason', async () => {
    const error = leaseError(409, 'lock_held');
    baseAPI.post.mockRejectedValue(error);
    await expect(api.renew('compose:write', 'lease-token')).rejects.toBe(error);
  });

  it('rethrows release 409 carrying an unexpected reason', async () => {
    const error = leaseError(409, 'lock_held');
    baseAPI.delete.mockRejectedValue(error);
    await expect(api.release('compose:write', 'lease-token')).rejects.toBe(error);
  });

  // A 409 with no parseable detail body is unknown, not contention.
  it('rethrows acquire 409 with no detail body', async () => {
    const error = { status: 409, detail: undefined };
    baseAPI.post.mockRejectedValue(error);
    await expect(api.acquire('compose:write')).rejects.toBe(error);
  });

  it.each([500, 401, 403])('rethrows acquire HTTP %i', async (status) => {
    const error = leaseError(status, 'server_error');
    baseAPI.post.mockRejectedValue(error);
    await expect(api.acquire('compose:write')).rejects.toBe(error);
  });

  it.each([
    [503, 'coordinator_unavailable'],
    [422, 'validation_error'],
    [429, 'lease_quota_exceeded'],
  ])('rethrows acquire HTTP %i instead of returning null', async (status, reason) => {
    const error = leaseError(status, reason);
    baseAPI.post.mockRejectedValue(error);
    await expect(api.acquire('compose:write')).rejects.toBe(error);
  });

  it('renews a lease and sends its token in the required header', async () => {
    await expect(api.renew('compose:write', 'lease-token', { ttlSeconds: 45 })).resolves.toEqual(grant);
    expect(baseAPI.post).toHaveBeenCalledWith(
      '/memory/locks/compose:write/renew',
      { ttl_seconds: 45 },
      { headers: { 'X-Lease-Token': 'lease-token' } },
    );
  });

  it('returns null only for renew 409 not_owner', async () => {
    baseAPI.post.mockRejectedValue(leaseError(409, 'not_owner'));
    await expect(api.renew('compose:write', 'lease-token')).resolves.toBeNull();
  });

  it('rethrows renew 503 instead of returning null', async () => {
    const error = leaseError(503, 'coordinator_unavailable');
    baseAPI.post.mockRejectedValue(error);
    await expect(api.renew('compose:write', 'lease-token')).rejects.toBe(error);
  });

  it('releases a lease and sends its token in the required header', async () => {
    await expect(api.release('compose:write', 'lease-token')).resolves.toBe(true);
    expect(baseAPI.delete).toHaveBeenCalledWith('/memory/locks/compose:write', {
      headers: { 'X-Lease-Token': 'lease-token' },
    });
  });

  it('sends lease tokens on the captured renew and release HTTP requests', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(grant),
      })
      .mockResolvedValueOnce({ status: 204, ok: true });
    const auth = {
      apiBaseUrl: 'http://localhost:9001',
      getAuthHeaders: (headers) => headers,
      getRequestOptions: (options) => options,
    };
    const apiWithFetch = new LockAPI(new BaseAPI(auth, { fetchFn }));

    await apiWithFetch.renew('compose:write', 'renew-token');
    await apiWithFetch.release('compose:write', 'release-token');

    expect(fetchFn.mock.calls[0][1].headers['X-Lease-Token']).toBe('renew-token');
    expect(fetchFn.mock.calls[1][1].headers['X-Lease-Token']).toBe('release-token');
  });

  it('returns false only for release 409 not_owner', async () => {
    baseAPI.delete.mockRejectedValue(leaseError(409, 'not_owner'));
    await expect(api.release('compose:write', 'lease-token')).resolves.toBe(false);
  });

  it('rethrows release 503 instead of returning false', async () => {
    const error = leaseError(503, 'coordinator_unavailable');
    baseAPI.delete.mockRejectedValue(error);
    await expect(api.release('compose:write', 'lease-token')).rejects.toBe(error);
  });
});
