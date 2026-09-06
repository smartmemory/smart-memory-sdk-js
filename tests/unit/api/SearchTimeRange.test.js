import { it, expect, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
it('forwards creation windows on both searches and preserves the response coverage', async () => {
  const envelope = { results: [], coverage: { created_at_backfilled_boundary: null } };
  const api = { post: vi.fn().mockResolvedValue(envelope), get: vi.fn() };
  const memory = new MemoryAPI(api);
  expect(await memory.search('atlas', { since: new Date('2026-09-01Z'), until: '2026-09-03' })).toBe(envelope);
  expect(api.post.mock.calls[0][1].since).toBe('2026-09-01T00:00:00.000Z');
  await memory.searchByMetadata('project', 'atlas', { since: '2026-09-01' });
  expect(api.get.mock.calls[0][0]).toContain('since=2026-09-01');
  await memory.search('atlas');
  expect(api.post.mock.calls[1][1]).not.toHaveProperty('since');
});
