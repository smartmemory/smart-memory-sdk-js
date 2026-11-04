// SM-PATTERN-CRUD-1: PatternAPI hits the pattern routes with the contract's request shapes.
import { describe, it, expect, vi } from 'vitest';
import { PatternAPI } from '../../../src/api/PatternAPI.js';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({})
  };
}

describe('PatternAPI', () => {
  it('lists with filters as query params', async () => {
    const api = mockBaseAPI();
    await new PatternAPI(api).list({ severity: 'error', q: 'gather', limit: 5 });
    expect(api.get).toHaveBeenCalledWith('/memory/patterns?limit=5&severity=error&q=gather');
  });

  it('gets one pattern with an encoded id', async () => {
    const api = mockBaseAPI();
    await new PatternAPI(api).get('pat/1');
    expect(api.get).toHaveBeenCalledWith('/memory/patterns/pat%2F1');
  });

  it('creates with every contract field and defaults', async () => {
    const api = mockBaseAPI();
    await new PatternAPI(api).create({ title: 'T', content: 'Rule', scope: ['**/*.py'] });
    expect(api.post).toHaveBeenCalledWith('/memory/patterns', {
      title: 'T',
      content: 'Rule',
      severity: 'warn',
      scope: ['**/*.py'],
      examples: [],
      rationale: '',
      source: 'user'
    });
  });

  it('updates only the given fields with PUT', async () => {
    const api = mockBaseAPI();
    await new PatternAPI(api).update('pat_1', { severity: 'error', updated_by: 'sdk-js:me' });
    expect(api.put).toHaveBeenCalledWith('/memory/patterns/pat_1', { severity: 'error', updated_by: 'sdk-js:me' });
  });

  it('retires with the soft DELETE and an encoded reason', async () => {
    const api = mockBaseAPI();
    await new PatternAPI(api).retire('pat_1', 'no longer true');
    expect(api.delete).toHaveBeenCalledWith('/memory/patterns/pat_1?reason=no%20longer%20true');
  });

  it('seeds from text, never a path', async () => {
    const api = mockBaseAPI();
    await new PatternAPI(api).seed('- [A](a.md) — a.', { files: { 'a.md': 'body' }, sourcePrefix: 'sdk:memory_md' });
    expect(api.post).toHaveBeenCalledWith('/memory/patterns/seed', {
      index_text: '- [A](a.md) — a.',
      files: { 'a.md': 'body' },
      refused: {},
      source_prefix: 'sdk:memory_md'
    });
  });

  it('propagates API errors', async () => {
    const api = mockBaseAPI();
    const err = Object.assign(new Error('Unprocessable'), { status: 422 });
    api.put.mockRejectedValue(err);
    await expect(new PatternAPI(api).update('pat_1', { status: 'retracted' })).rejects.toBe(err);
  });

  it('is mounted on the client as patterns', () => {
    const client = new SmartMemoryClient({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });
    expect(client.patterns).toBeInstanceOf(PatternAPI);
  });
});
