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
      patch: vi.fn().mockResolvedValue({}),
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

  it('create should pass conversationContext through as snake_case (SDK-CONSISTENCY-1 B2)', async () => {
    const ctx = { participants: ['alice', 'bob'], topic: 'project status' };
    await memoryAPI.create({ content: 'test', conversationContext: ctx });

    const body = baseAPI.post.mock.calls.at(-1)[1];
    expect(body.conversation_context).toEqual(ctx);
  });

  it('create should omit conversation_context when not provided (SDK-CONSISTENCY-1 B2)', async () => {
    await memoryAPI.create({ content: 'test' });
    const body = baseAPI.post.mock.calls.at(-1)[1];
    expect(body).not.toHaveProperty('conversation_context');
  });

  it('get should normalize item_id to id', async () => {
    baseAPI.get.mockResolvedValue({ item_id: 'abc', content: 'hello' });

    const result = await memoryAPI.get('abc');

    expect(baseAPI.get).toHaveBeenCalledWith('/memory/abc');
    expect(result.id).toBe('abc');
  });

  it('list should build query string with params', async () => {
    await memoryAPI.list({ limit: 10, offset: 5, type: 'semantic' });

    expect(baseAPI.get).toHaveBeenCalledWith('/memory/list?limit=10&offset=5&memory_type=semantic');
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

  it('list should omit metadata filter params when not supplied', async () => {
    await memoryAPI.list({ limit: 10 });

    const call = baseAPI.get.mock.calls[0][0];
    expect(call).not.toContain('metadata_key');
    expect(call).not.toContain('metadata_value');
  });

  it('list should send metadata filter params when supplied', async () => {
    await memoryAPI.list({ metadataKey: 'bot_topic', metadataValue: 'ml-research' });

    expect(baseAPI.get).toHaveBeenCalledWith(
      '/memory/list?limit=50&offset=0&metadata_key=bot_topic&metadata_value=ml-research'
    );
  });

  it('list should send a dotted metadata key unchanged', async () => {
    // Translation to the flattened storage separator happens server-side.
    await memoryAPI.list({ metadataKey: 'profile.tier', metadataValue: 'pro' });

    // Parse rather than substring-match: `toContain('metadata_key=profile.tier')`
    // is also satisfied by `metadata_key=profile.tier_extra`.
    const call = baseAPI.get.mock.calls[0][0];
    const query = new URLSearchParams(call.split('?')[1]);
    expect(query.get('metadata_key')).toBe('profile.tier');
    expect(query.get('metadata_value')).toBe('pro');
  });

  it('list should URL-encode metadata values containing reserved characters', async () => {
    // The whole point of using URLSearchParams: a raw concatenation would let
    // these characters split the query string and silently change the request.
    await memoryAPI.list({ metadataKey: 'topic', metadataValue: 'a&b=c d#e' });

    const call = baseAPI.get.mock.calls[0][0];
    expect(call).toContain('metadata_value=a%26b%3Dc+d%23e');

    const query = new URLSearchParams(call.split('?')[1]);
    expect(query.get('metadata_value')).toBe('a&b=c d#e');
    expect(query.get('limit')).toBe('50');
  });

  it('list should URL-encode non-ASCII metadata values', async () => {
    await memoryAPI.list({ metadataKey: 'topic', metadataValue: 'café ☕' });

    const call = baseAPI.get.mock.calls[0][0];
    const query = new URLSearchParams(call.split('?')[1]);
    expect(query.get('metadata_value')).toBe('café ☕');
  });

  it('update should only include defined fields', async () => {
    await memoryAPI.update('id-1', { content: 'updated' });

    expect(baseAPI.patch).toHaveBeenCalledWith('/memory/id-1', { content: 'updated' });
  });

  it('supersede should POST an append-only replacement contract', async () => {
    await memoryAPI.supersede('old-id', {
      content: 'Revised view',
      memoryType: 'opinion',
      metadata: { maya_self_origin: 'experience' },
      reason: 'New evidence'
    });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/old-id/supersede', {
      content: 'Revised view',
      memory_type: 'opinion',
      metadata: { maya_self_origin: 'experience' },
      reason: 'New evidence'
    });
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

  // CORE-EXPERTISE-1 Phase 4a — expertise flag toggles typed-dict response shape.
  it('search should pass expertise=true through to body', async () => {
    baseAPI.post.mockResolvedValueOnce({
      results: { decision: [], constraint: [], learned: [], opinion: [], reasoning: [], observation: [] }
    });
    const result = await memoryAPI.search('auth', { topK: 5, expertise: true });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search', {
      query: 'auth',
      top_k: 5,
      enable_hybrid: true,
      expertise: true
    });
    expect(result).toHaveProperty('results');
    expect(Object.keys(result.results)).toEqual(
      expect.arrayContaining(['decision', 'constraint', 'learned', 'opinion', 'reasoning', 'observation'])
    );
  });

  it('search should omit expertise when not set (default flat list)', async () => {
    await memoryAPI.search('plain query');
    const callBody = baseAPI.post.mock.calls.at(-1)[1];
    expect(callBody).not.toHaveProperty('expertise');
  });

  // RECALL-CITATIONS-1 — cite flag wraps response { results, citations }
  it('search should pass cite=true through to body', async () => {
    const wrapped = {
      results: [
        { item_id: 'id-1', content: 'alpha', memory_type: 'semantic', score: 0.9 }
      ],
      citations: [
        { n: 1, item_id: 'id-1', item_type: 'semantic', preview: 'alpha', score: 0.9, footnote_marker: '[^1]' }
      ]
    };
    baseAPI.post.mockResolvedValueOnce(wrapped);
    const result = await memoryAPI.search('anything', { topK: 5, cite: true });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search', {
      query: 'anything',
      top_k: 5,
      enable_hybrid: true,
      cite: true,
    });
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('citations');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].footnote_marker).toBe('[^1]');
  });

  it('search should omit cite when not set', async () => {
    await memoryAPI.search('plain query');
    const callBody = baseAPI.post.mock.calls.at(-1)[1];
    expect(callBody).not.toHaveProperty('cite');
  });

  // NEURO-1d — consolidationFirst surfaces a consolidated summary above its scattered sources.
  it('search should pass consolidationFirst=true through to body', async () => {
    await memoryAPI.search('what is known about X', { topK: 5, consolidationFirst: true });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search', {
      query: 'what is known about X',
      top_k: 5,
      enable_hybrid: true,
      consolidation_first: true,
    });
  });

  // CORE-CONSOLIDATE-1 — includeConsolidated surfaces consolidated source memories.
  it('search should pass includeConsolidated=true through to body', async () => {
    await memoryAPI.search('X', { topK: 5, includeConsolidated: true });
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search', {
      query: 'X',
      top_k: 5,
      enable_hybrid: true,
      include_consolidated: true,
    });
  });

  it('search should omit consolidation params when not set', async () => {
    await memoryAPI.search('plain query');
    const callBody = baseAPI.post.mock.calls.at(-1)[1];
    expect(callBody).not.toHaveProperty('consolidation_first');
    expect(callBody).not.toHaveProperty('include_consolidated');
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

    expect(baseAPI.get).toHaveBeenCalledWith('/memory/temporal/item-1/history?limit=50');
    const call = baseAPI.get.mock.calls[0][0];
    expect(call).toContain('/memory/temporal/item-1/history?limit=50');
  });

  it('runClustering should POST with params', async () => {
    await memoryAPI.runClustering(0.2, true);

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/clustering/run?distance_threshold=0.2&dry_run=true');
    const call = baseAPI.post.mock.calls[0][0];
    expect(call).toContain('distance_threshold=0.2');
    expect(call).toContain('dry_run=true');
  });

  it('clearAll should DELETE with nuclear flag', async () => {
    await memoryAPI.clearAll(true);

    expect(baseAPI.delete).toHaveBeenCalledWith('/memory/clear-all?nuclear=true');
  });

  // CORE-MEMORY-DYNAMICS-1 M1a — getWorkingContext
  it('getWorkingContext should POST to /memory/context with snake_case body', async () => {
    await memoryAPI.getWorkingContext('s1', 'hello');

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/context', {
      session_id: 's1',
      query: 'hello',
      k: 20,
    });
  });

  it('getWorkingContext should include max_tokens and strategy when set', async () => {
    await memoryAPI.getWorkingContext('s1', 'hello', { k: 10, maxTokens: 500, strategy: 'fast:recency' });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/context', {
      session_id: 's1',
      query: 'hello',
      k: 10,
      max_tokens: 500,
      strategy: 'fast:recency',
    });
  });

  it('getWorkingContext should omit optional params when null', async () => {
    await memoryAPI.getWorkingContext('s1', 'hello', { k: 5, maxTokens: null, strategy: null });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/context', {
      session_id: 's1',
      query: 'hello',
      k: 5,
    });
  });

  it('getWorkingContext should omit optional params when undefined (not just null)', async () => {
    // The JS method uses `!== null && !== undefined` — both paths must omit.
    await memoryAPI.getWorkingContext('s1', 'hello', { k: 5, maxTokens: undefined, strategy: undefined });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/context', {
      session_id: 's1',
      query: 'hello',
      k: 5,
    });
  });

  it('getWorkingContext should return response pass-through', async () => {
    const mockResponse = {
      decision_id: 'abc',
      items: [],
      drift_warnings: [],
      strategy_used: 'fast:recency',
      tokens_used: 0,
      tokens_budget: null,
      deprecation: null,
    };
    baseAPI.post.mockResolvedValueOnce(mockResponse);

    const result = await memoryAPI.getWorkingContext('s1', 'hello');
    expect(result).toEqual(mockResponse);
  });

  describe('feedback (SDK-CONSISTENCY-1 B1)', () => {
    it('should POST item_ids and outcome in the new contract shape', async () => {
      await memoryAPI.feedback(['id-1', 'id-2'], 'helpful');

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/feedback', {
        item_ids: ['id-1', 'id-2'],
        outcome: 'helpful',
      });
    });

    it('should include query when provided', async () => {
      await memoryAPI.feedback(['id-1'], 'misleading', 'what is jwt?');

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/feedback', {
        item_ids: ['id-1'],
        outcome: 'misleading',
        query: 'what is jwt?',
      });
    });

    it('should omit query when null/undefined', async () => {
      await memoryAPI.feedback(['id-1'], 'neutral');

      const body = baseAPI.post.mock.calls.at(-1)[1];
      expect(body).not.toHaveProperty('query');
    });
  });

  describe('endpoint paths', () => {
    it('getLineage should GET exact lineage path', async () => {
      await memoryAPI.getLineage('id-1');

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/id-1/lineage');
    });

    it('getLinks should GET exact links path', async () => {
      await memoryAPI.getLinks('id-1');

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/id-1/links');
    });

    it('searchByMetadata should GET exact metadata lookup path', async () => {
      await memoryAPI.searchByMetadata('source', 'chat', { memoryType: 'semantic' });

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/by-metadata?metadata_key=source&metadata_value=chat&limit=25&memory_type=semantic');
    });

    it('searchByMetadata should include default limit=25 when omitted', async () => {
      await memoryAPI.searchByMetadata('source', 'chat');

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/by-metadata?metadata_key=source&metadata_value=chat&limit=25');
    });

    it('getNeighbors should GET exact neighbors path', async () => {
      await memoryAPI.getNeighbors('id-1');

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/id-1/neighbors');
    });

    it('ingestConversation should POST exact conversation ingest path and body', async () => {
      await memoryAPI.ingestConversation([{ role: 'user', content: 'hello' }], {
        conversationId: 'conv-1',
        turnsPerChunk: 10
      });

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/ingest/conversation', {
        turns: [{ role: 'user', content: 'hello' }],
        turns_per_chunk: 10,
        max_chunk_chars: 12000,
        max_concurrent: 4,
        conversation_id: 'conv-1'
      });
    });

    it('ingestDocument should POST exact document ingest path and body', async () => {
      await memoryAPI.ingestDocument('doc body', { title: 'Doc', source: 'upload' });

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/ingest/document', {
        content: 'doc body',
        title: 'Doc',
        source: 'upload'
      });
    });

    it('codeIndex should POST exact code index path and body', async () => {
      await memoryAPI.codeIndex('/repo', { repo: 'sdk', commit: 'abc123' });

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/code/index', {
        path: '/repo',
        repo: 'sdk',
        commit: 'abc123'
      });
    });

    it('codeSearch should GET exact code search path', async () => {
      await memoryAPI.codeSearch('MemoryAPI', { entityType: 'class', repo: 'sdk', limit: 5, semantic: true });

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/code/search?query=MemoryAPI&limit=5&semantic=true&entity_type=class&repo=sdk');
    });

    it('codeContext should GET exact code context path', async () => {
      await memoryAPI.codeContext('MemoryAPI', { repo: 'sdk' });

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/code/context?entity_name=MemoryAPI&repo=sdk');
    });

    it('codeDeadCode should GET exact dead-code path', async () => {
      await memoryAPI.codeDeadCode('smart memory/sdk');

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/code/dead-code?repo=smart%20memory%2Fsdk');
    });

    it('codeDependencies should GET exact dependencies path', async () => {
      await memoryAPI.codeDependencies('MemoryAPI', { direction: 'out', repo: 'sdk' });

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/code/dependencies?entity_name=MemoryAPI&direction=out&repo=sdk');
    });

    it('getPlan should GET exact plan path', async () => {
      await memoryAPI.getPlan('plan-1');

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/plans/plan-1');
    });

    it('updatePlanTask should PATCH exact plan task path and body', async () => {
      await memoryAPI.updatePlanTask('plan-1', { taskId: 'task-1', status: 'done' });

      expect(baseAPI.patch).toHaveBeenCalledWith('/memory/plans/plan-1/task', {
        task_id: 'task-1',
        status: 'done'
      });
    });

    it('completePlan should POST exact complete plan path and body', async () => {
      await memoryAPI.completePlan('plan-1', { graduate: true });

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/plans/plan-1/complete', {
        graduate: true
      });
    });

    it('failPlan should POST exact fail plan path and body', async () => {
      await memoryAPI.failPlan('plan-1', 'blocked');

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/plans/plan-1/fail', {
        reason: 'blocked'
      });
    });

    it('enrich should POST exact enrich path and body', async () => {
      await memoryAPI.enrich('item-1', ['grounding']);

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/item-1/enrich', {
        item_id: 'item-1',
        routines: ['grounding']
      });
    });

    it('personalize should POST exact personalize path and body', async () => {
      await memoryAPI.personalize({ role: 'dev' }, { tone: 'direct' });

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/personalize', {
        traits: { role: 'dev' },
        preferences: { tone: 'direct' }
      });
    });

    it('ground should POST exact ground path and body', async () => {
      await memoryAPI.ground('item-1', 'https://example.com', { source: 'manual' });

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/item-1/ground', {
        item_id: 'item-1',
        source_url: 'https://example.com',
        validation: { source: 'manual' }
      });
    });

    it('timeTravel should GET exact temporal-at path', async () => {
      await memoryAPI.timeTravel('2026-01-01T00:00:00Z', { query: 'auth', limit: 10 });

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/temporal/at/2026-01-01T00:00:00Z?limit=10&query=auth');
    });

    it('getItemAtTime should GET exact temporal item path', async () => {
      await memoryAPI.getItemAtTime('item-1', '2026-01-01');

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/temporal/item-1/at/2026-01-01');
    });

    it('getChanges should GET exact changes path', async () => {
      await memoryAPI.getChanges('item-1', { since: '2026-01-01', until: '2026-01-02', changeType: 'update' });

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/temporal/item-1/changes?since=2026-01-01&until=2026-01-02&change_type=update');
    });

    it('compareVersions should POST exact compare path', async () => {
      await memoryAPI.compareVersions('item-1', 1, 2);

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/temporal/item-1/compare?v1=1&v2=2');
    });

    it('rollback should POST exact rollback path', async () => {
      await memoryAPI.rollback('item-1', { toVersion: 3 });

      expect(baseAPI.post).toHaveBeenCalledWith('/memory/temporal/item-1/rollback?to_version=3');
    });

    it('getClusteringStats should GET exact clustering stats path', async () => {
      await memoryAPI.getClusteringStats();

      expect(baseAPI.get).toHaveBeenCalledWith('/memory/clustering/stats');
    });
  });
});
