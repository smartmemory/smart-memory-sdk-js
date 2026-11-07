import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { SummaryAPI } from '../../../src/api/SummaryAPI.js';

describe('SummaryAPI', () => {
  let baseAPI;
  let api;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(null),
    };
    api = new SummaryAPI(baseAPI);
  });

  it('generate POSTs /memory/summary/generate with snake_case body', async () => {
    await api.generate({ windowStart: '2026-04-28T00:00:00Z', includeMarkdown: false });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/summary/generate', {
      window_start: '2026-04-28T00:00:00Z',
      include_markdown: false,
    });
  });

  it('generate uses defaults when no params provided', async () => {
    await api.generate();
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/summary/generate', {
      window_start: null,
      include_markdown: true,
    });
  });

  it('latest GETs /memory/summary/latest', async () => {
    baseAPI.get.mockResolvedValue({ snapshot_id: 'snap_x' });
    const out = await api.latest();
    expect(baseAPI.get).toHaveBeenCalledWith('/memory/summary/latest');
    expect(out.snapshot_id).toBe('snap_x');
  });

  it('latest returns null on 404', async () => {
    baseAPI.get.mockRejectedValue({ status: 404 });
    expect(await api.latest()).toBeNull();
  });

  it('latest re-throws non-404 errors', async () => {
    baseAPI.get.mockRejectedValue({ status: 500 });
    await expect(api.latest()).rejects.toMatchObject({ status: 500 });
  });

  it('get returns null on 404', async () => {
    baseAPI.get.mockRejectedValue({ status: 404 });
    expect(await api.get('snap_nope')).toBeNull();
  });

  describe('query transport through BaseAPI', () => {
    let fetchFn;

    beforeEach(() => {
      fetchFn = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => ({ snapshots: [] }),
      });
      const auth = new AuthCore({
        mode: 'sso', apiBaseUrl: 'https://summary.invalid', storage: 'memory',
      });
      api = new SummaryAPI(new BaseAPI(auth, { fetchFn }));
    });

    function expectQuery(path, query) {
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, options] = fetchFn.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://summary.invalid');
      expect(parsed.pathname).toBe(path);
      expect(Object.fromEntries(parsed.searchParams)).toEqual(query);
      expect(url).not.toContain('/?');
      expect(url).not.toMatch(/[?&]$/);
      expect(options.method).toBe('GET');
      for (const key of ['limit', 'is_heartbeat', 'before', 'from', 'to']) {
        expect(options).not.toHaveProperty(key);
      }
    }

    it('list sends paging and false heartbeat in the URL and returns the response', async () => {
      const before = '2026-11-06T22:10:00+08:00';
      expect(await api.list({ isHeartbeat: false, limit: 5, before })).toEqual({ snapshots: [] });
      expectQuery('/memory/summary/list', { limit: '5', is_heartbeat: 'false', before });
    });

    it('list keeps the default limit and omits unset filters', async () => {
      await api.list();
      expectQuery('/memory/summary/list', { limit: '20' });
    });

    it('list preserves true and zero instead of dropping falsy values', async () => {
      await api.list({ isHeartbeat: true, limit: 0 });
      expectQuery('/memory/summary/list', { limit: '0', is_heartbeat: 'true' });
    });

    it('list omits null fields and keeps undefined defaults', async () => {
      await api.list({ isHeartbeat: undefined, limit: null, before: undefined });
      expectQuery('/memory/summary/list', {});
    });

    it('list applies the default limit for explicit undefined', async () => {
      await api.list({ isHeartbeat: null, limit: undefined, before: null });
      expectQuery('/memory/summary/list', { limit: '20' });
    });

    it('delta encodes both snapshot IDs in the URL and returns the response', async () => {
      const ids = { from: 'snap a&from=?/#', to: 'snap+b=雪' };
      expect(await api.delta(ids)).toEqual({ snapshots: [] });
      expectQuery('/memory/summary/delta', ids);
    });

    it('delta omits null and undefined fields', async () => {
      await api.delta({ from: null, to: undefined });
      expectQuery('/memory/summary/delta', {});
    });

    it('delta returns null on a real BaseAPI 404', async () => {
      fetchFn.mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: 'Not found' }) });
      expect(await api.delta({ from: 'a', to: 'b' })).toBeNull();
      expectQuery('/memory/summary/delta', { from: 'a', to: 'b' });
    });

    it('delta preserves non-404 errors', async () => {
      fetchFn.mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: 'Invalid snapshot' }) });
      await expect(api.delta({ from: 'a', to: 'b' })).rejects.toMatchObject({ status: 422 });
    });
  });

  it('getMarkdown hits the /markdown sub-route', async () => {
    baseAPI.get.mockResolvedValue({ snapshot_id: 's', markdown: '# h' });
    const out = await api.getMarkdown('s');
    expect(baseAPI.get).toHaveBeenCalledWith('/memory/summary/s/markdown');
    expect(out.markdown).toContain('# h');
  });

  it('delete calls baseAPI.delete', async () => {
    await api.delete('snap_x');
    expect(baseAPI.delete).toHaveBeenCalledWith('/memory/summary/snap_x');
  });
});
