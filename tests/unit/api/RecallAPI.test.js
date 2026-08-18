import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecallAPI } from '../../../src/api/RecallAPI.js';

describe('RecallAPI', () => {
  let baseAPI;
  let api;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(null),
    };
    api = new RecallAPI(baseAPI);
  });

  it('pack POSTs /memory/recall/pack with snake_case body', async () => {
    await api.pack({ budgetTokens: 4000, query: 'what changed', sections: [{ name: 'notes', capTokens: 200 }] });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 4000,
      query: 'what changed',
      sections: [{ name: 'notes', cap_tokens: 200 }],
    });
  });

  it('pack accepts sections already in snake_case', async () => {
    await api.pack({ budgetTokens: 1000, sections: [{ name: 'anchors', cap_tokens: 50 }] });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 1000,
      sections: [{ name: 'anchors', cap_tokens: 50 }],
    });
  });

  it('pack omits query and sections when not provided', async () => {
    await api.pack({ budgetTokens: 2000 });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 2000,
    });
  });

  it('pack forwards the wakeup preset', async () => {
    await api.pack({ budgetTokens: 200, preset: 'wakeup' });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 200,
      preset: 'wakeup',
    });
  });

  it('pack omits preset when not provided', async () => {
    await api.pack({ budgetTokens: 2000, query: 'auth' });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 2000,
      query: 'auth',
    });
  });

  it('pack treats a null preset as omitted', async () => {
    await api.pack({ budgetTokens: 2000, preset: null });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 2000,
    });
  });

  it('pack treats null sections like undefined instead of throwing', async () => {
    // `sections: null` used to reach `null.map(...)` and throw. null is what you get
    // from JSON.parse, a default-valued config object, or a spread options object.
    await expect(api.pack({ budgetTokens: 2000, sections: null })).resolves.toBeDefined();
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 2000,
    });
  });

  it('pack treats null query like undefined', async () => {
    await api.pack({ budgetTokens: 2000, query: null });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 2000,
    });
  });

  it('pack omits both when null together', async () => {
    await api.pack({ budgetTokens: 500, query: null, sections: null });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/recall/pack', {
      budget_tokens: 500,
    });
  });

  it('pack returns the RecallPack response', async () => {
    const recallPack = {
      block: '## notes\nsome text',
      manifest: {
        budget_tokens: 4000,
        used_tokens: 120,
        tokenizer: 'heuristic:chars/4',
        query: null,
        sections: [
          { name: 'notes', cap_tokens: 200, used_tokens: 120, items_packed: 2, items_compacted: 0, items_dropped: 0 },
        ],
      },
    };
    baseAPI.post.mockResolvedValue(recallPack);
    const out = await api.pack({ budgetTokens: 4000 });
    expect(out).toEqual(recallPack);
  });
});
