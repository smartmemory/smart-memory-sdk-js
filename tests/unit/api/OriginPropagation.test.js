import { describe, it, expect, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';

describe('origin context', () => {
  it('passes through ingest, conversation and document', async () => {
    const transport = { post: vi.fn().mockResolvedValue({}) };
    const api = new MemoryAPI(transport);
    const context = { origin: 'import:obsidian' };
    await api.ingest('note', { context });
    await api.ingestConversation([{ role: 'user', content: 'hello' }], { context });
    await api.ingestDocument('note', { source: 'https://example.com', context });
    expect(transport.post.mock.calls).toHaveLength(3);
    for (const [, body] of transport.post.mock.calls) expect(body.context).toEqual(context);
  });
});
