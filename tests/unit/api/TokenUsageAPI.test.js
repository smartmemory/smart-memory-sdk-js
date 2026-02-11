import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenUsageAPI } from '../../../src/api/TokenUsageAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  };
}

describe('TokenUsageAPI', () => {
  it('should get usage with no params', async () => {
    const api = mockBaseAPI();
    const tokenUsage = new TokenUsageAPI(api);
    await tokenUsage.getUsage();

    expect(api.get).toHaveBeenCalledWith('/memory/token-usage');
  });

  it('should get usage with query params', async () => {
    const api = mockBaseAPI();
    const tokenUsage = new TokenUsageAPI(api);
    await tokenUsage.getUsage({
      start_date: '2026-02-01',
      end_date: '2026-02-11',
      group_by: 'stage',
      limit: 50,
    });

    expect(api.get).toHaveBeenCalledWith(
      '/memory/token-usage?start_date=2026-02-01&end_date=2026-02-11&group_by=stage&limit=50'
    );
  });

  it('should get current token usage', async () => {
    const api = mockBaseAPI();
    const tokenUsage = new TokenUsageAPI(api);
    await tokenUsage.getCurrent();

    expect(api.get).toHaveBeenCalledWith('/memory/token-usage/current');
  });
});
