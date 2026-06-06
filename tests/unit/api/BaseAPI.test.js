import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { APIError } from '../../../src/errors/APIError.js';

describe('BaseAPI', () => {
  let authCore;
  let baseAPI;

  beforeEach(() => {
    vi.restoreAllMocks();
    authCore = new AuthCore({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });
    baseAPI = new BaseAPI(authCore);
  });

  describe('request', () => {
    // Regression: native fetch enforces `this === Window`. A previous
    // implementation returned `globalThis.fetch` from the fetchFn getter as
    // a bare reference; calling `this.fetchFn(...)` then invoked fetch with
    // `this = undefined`, throwing "Failed to execute 'fetch' on 'Window':
    // Illegal invocation". This test pins the binding contract.
    it('does not lose this-binding when invoking native fetch', async () => {
      let capturedThis = 'unset';
      // Simulate the browser's native binding check: throw unless called as a
      // method on globalThis (or with explicit binding). vi.spyOn would smear
      // over this — assign a function whose body inspects `this`.
      const nativeLike = function (url, init) {
        capturedThis = this;
        if (this !== globalThis) {
          throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      };
      const original = globalThis.fetch;
      globalThis.fetch = nativeLike;
      try {
        await expect(baseAPI.get('/memory/list')).resolves.toEqual({});
        expect(capturedThis).toBe(globalThis);
      } finally {
        globalThis.fetch = original;
      }
    });

    it('should make GET request with auth headers', async () => {
      authCore.currentToken = 'test-token';
      authCore.tokenManager.setTeamId('team-1');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'result' })
      });

      const result = await baseAPI.get('/memory/list');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:9001/memory/list',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'X-Workspace-Id': 'team-1',
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual({ data: 'result' });
    });

    it('should make POST request with JSON body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '1' })
      });

      const result = await baseAPI.post('/memory/add', { content: 'test' });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:9001/memory/add',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'test' })
        })
      );
      expect(result).toEqual({ id: '1' });
    });

    it('should return null for 204 No Content', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 204
      });

      const result = await baseAPI.delete('/memory/123');
      expect(result).toBeNull();
    });

    it('should throw APIError for non-ok responses', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: 'Not found' })
      });

      await expect(baseAPI.get('/memory/missing'))
        .rejects.toThrow(APIError);
    });

    // Regression (BETA-NDA-1): a structured FastAPI `detail` (object) must not be
    // coerced into the Error message — that rendered "[object Object]" on the NDA
    // gate's 409 version_mismatch. The message must be a string; the full body
    // must still be preserved on error.detail for callers (e.g. ndaGate.js reads
    // error.detail.detail.code).
    it('stringifies a structured object detail instead of "[object Object]"', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: { code: 'version_mismatch', current_version: 'v1' } })
      });

      const err = await baseAPI.get('/memory/beta/nda/accept').catch((e) => e);
      expect(err).toBeInstanceOf(APIError);
      expect(typeof err.message).toBe('string');
      expect(err.message).not.toBe('[object Object]');
      expect(err.message).toBe('version_mismatch');
      // Full body preserved for structured consumers.
      expect(err.detail.detail.code).toBe('version_mismatch');
    });

    it('uses the first 422 validation message', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 422,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: [{ msg: 'field required', loc: ['body', 'x'] }] })
      });

      const err = await baseAPI.get('/memory/x').catch((e) => e);
      expect(err.message).toBe('field required');
    });
  });

  describe('401 refresh+retry', () => {
    it('should refresh token and retry on 401', async () => {
      authCore.currentToken = 'expired-token';
      authCore.tokenManager.setRefreshToken('valid-refresh');

      const calls = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
        calls.push({ url, opts });

        // First call to /memory/list: 401
        if (url.includes('/memory/list') && !opts.__isRetry) {
          return { ok: false, status: 401 };
        }
        // Refresh call: success
        if (url.includes('/auth/refresh')) {
          return {
            ok: true,
            json: () => Promise.resolve({ access_token: 'fresh-token' })
          };
        }
        // Retry call to /memory/list: success
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] })
        };
      });

      const result = await baseAPI.get('/memory/list');

      expect(result).toEqual({ items: [] });
      expect(calls).toHaveLength(3);
    });

    it('should clear local auth and throw on failed refresh', async () => {
      authCore.currentToken = 'expired';

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401
      });

      const clearLocalAuthSpy = vi.spyOn(authCore, 'clearLocalAuth').mockImplementation(() => {});

      await expect(baseAPI.get('/memory/list'))
        .rejects.toThrow('Authentication required');
      expect(clearLocalAuthSpy).toHaveBeenCalled();
    });
  });

  describe('custom fetchFn', () => {
    it('should use custom fetchFn when provided', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ custom: true })
      });

      const customBaseAPI = new BaseAPI(authCore, { fetchFn: customFetch });
      const result = await customBaseAPI.get('/memory/list');

      expect(customFetch).toHaveBeenCalledWith(
        'http://localhost:9001/memory/list',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual({ custom: true });
    });

    it('should fall back to globalThis.fetch when fetchFn not provided', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ default: true })
      });

      const result = await baseAPI.get('/memory/list');

      expect(fetch).toHaveBeenCalled();
      expect(result).toEqual({ default: true });
    });
  });

  describe('network errors', () => {
    it('should wrap fetch errors in APIError', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await baseAPI.get('/memory/list');
      } catch (e) {
        expect(e).toBeInstanceOf(APIError);
        expect(e.status).toBe(0);
      }
    });
  });
});
