import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('list passes through limit + isHeartbeat as query params', async () => {
    await api.list({ isHeartbeat: false, limit: 5 });
    const args = baseAPI.get.mock.calls[0];
    expect(args[0]).toBe('/memory/summary/list');
    expect(args[1]).toEqual({ limit: 5, is_heartbeat: false });
  });

  it('delta passes from/to as query params', async () => {
    await api.delta({ from: 'snap_a', to: 'snap_b' });
    expect(baseAPI.get).toHaveBeenCalledWith('/memory/summary/delta', {
      from: 'snap_a',
      to: 'snap_b',
    });
  });

  it('delta returns null on 404', async () => {
    baseAPI.get.mockRejectedValue({ status: 404 });
    expect(await api.delta({ from: 'a', to: 'b' })).toBeNull();
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
