import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';

describe('MemoryAPI', () => {
  let baseAPI;
  let memoryAPI;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(null)
    };
    memoryAPI = new MemoryAPI(baseAPI);
  });

  it('create should POST to /memory/add with snake_case params', async () => {
    await memoryAPI.create({ content: 'test', memoryType: 'semantic' });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/add', {
      content: 'test',
      memory_type: 'semantic',
      metadata: null,
      use_pipeline: true,
      profile_name: null
    });
  });

  it('get should normalize item_id to id', async () => {
    baseAPI.get.mockResolvedValue({ item_id: 'abc', content: 'hello' });

    const result = await memoryAPI.get('abc');

    expect(baseAPI.get).toHaveBeenCalledWith('/memory/abc');
    expect(result.id).toBe('abc');
  });

  it('list should build query string with params', async () => {
    await memoryAPI.list({ limit: 10, offset: 5, type: 'semantic' });

    const call = baseAPI.get.mock.calls[0][0];
    expect(call).toContain('/memory/list?');
    expect(call).toContain('limit=10');
    expect(call).toContain('offset=5');
    expect(call).toContain('memory_type=semantic');
  });

  it('list should use defaults when no params provided', async () => {
    await memoryAPI.list();

    const call = baseAPI.get.mock.calls[0][0];
    expect(call).toContain('limit=50');
    expect(call).toContain('offset=0');
  });

  it('update should only include defined fields', async () => {
    await memoryAPI.update('id-1', { content: 'updated' });

    expect(baseAPI.put).toHaveBeenCalledWith('/memory/id-1', { content: 'updated' });
  });

  it('delete should call DELETE /memory/:id', async () => {
    await memoryAPI.delete('id-1');
    expect(baseAPI.delete).toHaveBeenCalledWith('/memory/id-1');
  });

  it('search should POST with snake_case params', async () => {
    await memoryAPI.search('find this', { topK: 10, memoryType: 'working' });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search', {
      query: 'find this',
      top_k: 10,
      enable_hybrid: true,
      memory_type: 'working'
    });
  });

  it('ingest should POST to /memory/ingest', async () => {
    await memoryAPI.ingest('raw content', { extractorName: 'llm' });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/ingest', {
      content: 'raw content',
      profile_name: null,
      extractor_name: 'llm',
      context: {}
    });
  });

  it('searchAdvanced should POST with algorithm params', async () => {
    await memoryAPI.searchAdvanced('query', { algorithm: 'query_traversal', maxResults: 20 });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search/advanced', {
      query: 'query',
      algorithm: 'query_traversal',
      max_results: 20,
      use_ssg: true
    });
  });

  it('getSummary should GET /memory/summary', async () => {
    await memoryAPI.getSummary();
    expect(baseAPI.get).toHaveBeenCalledWith('/memory/summary');
  });

  it('link should POST to /memory/link', async () => {
    await memoryAPI.link('src-1', 'tgt-1', 'SUPPORTS');

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/link', {
      source_id: 'src-1',
      target_id: 'tgt-1',
      link_type: 'SUPPORTS'
    });
  });

  it('getHistory should build temporal URL', async () => {
    await memoryAPI.getHistory('item-1', { limit: 50 });

    const call = baseAPI.get.mock.calls[0][0];
    expect(call).toContain('/memory/temporal/item-1/history?limit=50');
  });

  it('runClustering should POST with params', async () => {
    await memoryAPI.runClustering(0.2, true);

    const call = baseAPI.post.mock.calls[0][0];
    expect(call).toContain('distance_threshold=0.2');
    expect(call).toContain('dry_run=true');
  });

  it('clearAll should DELETE with nuclear flag', async () => {
    await memoryAPI.clearAll(true);

    expect(baseAPI.delete).toHaveBeenCalledWith('/memory/clear-all?nuclear=true');
  });
});
