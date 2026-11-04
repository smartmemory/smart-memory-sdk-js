import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearnedAPI } from '../../../src/api/LearnedAPI.js';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';

describe('LearnedAPI', () => {
  let baseAPI;
  let api;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({ item_id: 'x' }),
      delete: vi.fn().mockResolvedValue(null),
    };
    api = new LearnedAPI(baseAPI);
  });

  it('addLearning POSTs /memory/learned with the snake_case body', async () => {
    const out = await api.addLearning('dry-run every migration', {
      category: 'ops',
      incidentLink: 'INC-7',
      learnedScope: 'repo',
    });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/learned', {
      content: 'dry-run every migration',
      category: 'ops',
      incident_link: 'INC-7',
      learned_scope: 'repo',
    });
    expect(out).toEqual({ item_id: 'x' });
  });

  it('addLearning omits options that were not set', async () => {
    await api.addLearning('only the lesson');
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/learned', { content: 'only the lesson' });
  });

  it('addLearning never sends a scope or workspace the caller slips into the options', async () => {
    await api.addLearning('c', { scope: 'other-workspace', workspaceId: 'other-workspace', workspace_id: 'other' });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/learned', { content: 'c' });
  });

  it('addConstraint POSTs /memory/constraints with the snake_case body', async () => {
    await api.addConstraint('never publish an sdist', {
      domain: 'release',
      source: 'owner',
      expiresAt: '2030-01-01T00:00:00Z',
    });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/constraints', {
      content: 'never publish an sdist',
      domain: 'release',
      source: 'owner',
      expires_at: '2030-01-01T00:00:00Z',
    });
  });

  it('addConstraint omits options that were not set', async () => {
    await api.addConstraint('a rule');
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/constraints', { content: 'a rule' });
  });

  it('addConstraint never sends a scope or workspace the caller slips into the options', async () => {
    await api.addConstraint('c', { scope: 'other-workspace', workspaceId: 'other-workspace' });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/constraints', { content: 'c' });
  });

  it('a refusal from the server rejects, it is not swallowed', async () => {
    baseAPI.post.mockRejectedValue(new Error('403 read-only'));
    await expect(api.addLearning('c')).rejects.toThrow('403');
    await expect(api.addConstraint('c')).rejects.toThrow('403');
  });

  it('the client mounts it as client.learned', () => {
    const client = new SmartMemoryClient({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory',
    });
    expect(client.learned).toBeInstanceOf(LearnedAPI);
  });
});
