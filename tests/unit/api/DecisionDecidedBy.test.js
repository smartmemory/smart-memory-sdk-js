import { describe, it, expect, vi } from 'vitest';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';

// CLAIMS-BUILD-20: decided_by / recommended_by are caller-stated text, sent only when given.
function mockBaseAPI() {
  return { post: vi.fn().mockResolvedValue({}), get: vi.fn().mockResolvedValue({}) };
}

const STATED = { decided_by: 'Maria Chen', recommended_by: 'pricing-agent' };

describe('DecisionAPI decided_by / recommended_by', () => {
  it('create sends both fields', async () => {
    const api = mockBaseAPI();
    await new DecisionAPI(api).create({ content: 'c', decidedBy: 'Maria Chen', recommendedBy: 'pricing-agent' });
    expect(api.post.mock.calls[0][0]).toBe('/memory/decisions/create');
    expect(api.post.mock.calls[0][1]).toMatchObject(STATED);
  });

  it('createPending sends both fields', async () => {
    const api = mockBaseAPI();
    await new DecisionAPI(api).createPending({
      content: 'c', requirements: [{ description: 'r' }], decidedBy: 'Maria Chen', recommendedBy: 'pricing-agent'
    });
    expect(api.post.mock.calls[0][0]).toBe('/memory/decisions/pending/create');
    expect(api.post.mock.calls[0][1]).toMatchObject(STATED);
  });

  it('supersede passes both fields for the replacement', async () => {
    const api = mockBaseAPI();
    await new DecisionAPI(api).supersede('dec_1', { new_content: 'c2', reason: 'r', ...STATED });
    expect(api.post.mock.calls[0][0]).toBe('/memory/decisions/dec_1/supersede');
    expect(api.post.mock.calls[0][1]).toMatchObject(STATED);
  });

  it('supersede takes camelCase like create (CLAIMS-20-FIX1 L1)', async () => {
    const api = mockBaseAPI();
    await new DecisionAPI(api).supersede('dec_1', {
      new_content: 'c2', reason: 'r', decidedBy: 'Maria Chen', recommendedBy: 'pricing-agent'
    });
    const body = api.post.mock.calls[0][1];
    expect(body).toMatchObject(STATED);
    expect(body).not.toHaveProperty('decidedBy');
    expect(body).not.toHaveProperty('recommendedBy');
  });

  it('supersede refuses an unknown key instead of sending it to be ignored', async () => {
    const api = mockBaseAPI();
    await expect(new DecisionAPI(api).supersede('dec_1', { new_content: 'c2', reason: 'r', decidedby: 'x' }))
      .rejects.toThrow(/decidedby/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('supersede refuses the same field given twice with different values', async () => {
    const api = mockBaseAPI();
    await expect(new DecisionAPI(api).supersede('dec_1', {
      new_content: 'c2', reason: 'r', decidedBy: 'Maria Chen', decided_by: 'Raj Patel'
    })).rejects.toThrow(/decided_by/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('create and createPending omit both fields when unset', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.create({ content: 'c' });
    await decisions.createPending({ content: 'c', requirements: [{ description: 'r' }] });
    for (const [, body] of api.post.mock.calls) {
      expect(body).not.toHaveProperty('decided_by');
      expect(body).not.toHaveProperty('recommended_by');
    }
  });
});
