import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';

// DIST-LITE-9 — contract: docs/features/DIST-LITE-9/ask-contract.json
describe('MemoryAPI.ask', () => {
  let baseAPI;
  let api;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({
        answer: 'No.',
        reasoning: 'Zed trusts Yara.',
        evidence: [{ item_id: 'mem_amulet', content: 'Zed does not believe it.' }],
        relations: [
          { source: 'Zed', type: 'trusts', target: 'Yara', source_id: 'ent_zed', target_id: 'ent_yara' },
        ],
      }),
      delete: vi.fn().mockResolvedValue(null),
    };
    api = new MemoryAPI(baseAPI);
  });

  it('POSTs /memory/ask with the default limit', async () => {
    await api.ask('Does Zed believe the amulet was stolen by Yara?');
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/ask', {
      question: 'Does Zed believe the amulet was stolen by Yara?',
      limit: 5,
    });
  });

  it('forwards an explicit limit', async () => {
    await api.ask('who stole it', { limit: 12 });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/ask', { question: 'who stole it', limit: 12 });
  });

  it('omits reasoning at its default so every client sends the same body', async () => {
    await api.ask('who stole it');
    expect(baseAPI.post.mock.calls[0][1]).not.toHaveProperty('reasoning');
  });

  it('sends reasoning only when suppressed', async () => {
    await api.ask('who stole it', { reasoning: false });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/ask', {
      question: 'who stole it',
      limit: 5,
      reasoning: false,
    });
  });

  it('returns the contract body unchanged, node ids included', async () => {
    const result = await api.ask('who trusts whom');
    expect(Object.keys(result).sort()).toEqual(['answer', 'evidence', 'reasoning', 'relations']);
    expect(result.evidence[0].item_id).toBe('mem_amulet');
    expect(result.relations[0].source_id).toBe('ent_zed');
    expect(result.relations[0].target_id).toBe('ent_yara');
  });
});
