import { it, expect, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
it('maps hopStrategy to hop_strategy and omits null', async () => {
  const api = { post: vi.fn() };
  const memory = new MemoryAPI(api);
  for (const hopStrategy of ['consensus', 'relevance', 'semantic']) {
    await memory.search('bridge', { multiHop: true, hopStrategy });
    expect(api.post.mock.lastCall[1].hop_strategy).toBe(hopStrategy);
  }
  await memory.search('bridge');
  expect(api.post.mock.lastCall[1]).not.toHaveProperty('hop_strategy');
});
