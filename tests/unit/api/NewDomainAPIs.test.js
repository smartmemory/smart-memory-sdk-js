import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemporalAPI } from '../../../src/api/TemporalAPI.js';
import { GovernanceAPI } from '../../../src/api/GovernanceAPI.js';
import { EvolutionAPI } from '../../../src/api/EvolutionAPI.js';
import { ReasoningAPI } from '../../../src/api/ReasoningAPI.js';
import { ReasoningTracesAPI } from '../../../src/api/ReasoningTracesAPI.js';
import { OntologyAPI } from '../../../src/api/OntologyAPI.js';
import { AnalyticsAPI } from '../../../src/api/AnalyticsAPI.js';
import { ValidationAPI } from '../../../src/api/ValidationAPI.js';
import { PipelineAPI } from '../../../src/api/PipelineAPI.js';
import { ArchiveAPI } from '../../../src/api/ArchiveAPI.js';
import { ZettelkastenAPI } from '../../../src/api/ZettelkastenAPI.js';
import { GraphAPI } from '../../../src/api/GraphAPI.js';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';
import { ProcedureMatchAPI } from '../../../src/api/ProcedureMatchAPI.js';
import { ProcedureCandidateAPI } from '../../../src/api/ProcedureCandidateAPI.js';
import { ProcedureDriftAPI } from '../../../src/api/ProcedureDriftAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(null)
  };
}

// ============================================================
// DecisionAPI - new methods added in this batch
// ============================================================

describe('DecisionAPI (new methods)', () => {
  it('should create a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.create({
      content: 'Use FalkorDB for graph storage',
      decisionType: 'architecture',
      confidence: 0.95,
      domain: 'infrastructure',
      tags: ['database', 'graph']
    });

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/create', {
      content: 'Use FalkorDB for graph storage',
      decision_type: 'architecture',
      confidence: 0.95,
      source_trace_id: null,
      source_session_id: null,
      evidence_ids: null,
      agent_id: null,
      domain: 'infrastructure',
      tags: ['database', 'graph'],
      // CORE-EXPERTISE-1 Phase 1 — new fields default null when omitted.
      rejected_alternatives: null,
      rationale: null,
      constraints: null
    });
  });

  it('should create a decision with expertise fields (CORE-EXPERTISE-1)', async () => {
    const api = mockBaseAPI();
    // Stub the response so we can assert the SDK passes it through to the caller.
    api.post = vi.fn().mockResolvedValue({
      decision_id: 'dec_exp',
      status: 'active',
      rejected_alternatives: ['session tokens', 'OAuth'],
      rationale: 'Stateless plus mobile coverage',
      constraints: ['mobile <v3.2', 'no shared store']
    });
    const decisions = new DecisionAPI(api);
    const result = await decisions.create({
      content: 'Use JWT for auth tokens',
      decisionType: 'choice',
      rejectedAlternatives: ['session tokens', 'OAuth'],
      rationale: 'Stateless plus mobile coverage',
      constraints: ['mobile <v3.2', 'no shared store']
    });

    // Outbound payload uses snake_case.
    const payload = api.post.mock.calls[0][1];
    expect(payload.rejected_alternatives).toEqual(['session tokens', 'OAuth']);
    expect(payload.rationale).toBe('Stateless plus mobile coverage');
    expect(payload.constraints).toEqual(['mobile <v3.2', 'no shared store']);

    // Inbound response surfaces the three fields back to the caller.
    expect(result.rejected_alternatives).toEqual(['session tokens', 'OAuth']);
    expect(result.rationale).toBe('Stateless plus mobile coverage');
    expect(result.constraints).toEqual(['mobile <v3.2', 'no shared store']);
  });

  it('should get a decision by ID', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.get('d-42');

    expect(api.get).toHaveBeenCalledWith('/memory/decisions/d-42');
  });

  it('should search decisions by topic', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.search('graph database', 10);

    expect(api.get).toHaveBeenCalledWith('/memory/decisions/search?topic=graph%20database&limit=10');
  });

  it('should contradict a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.contradict('d-1', 'ev-99');

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/contradict', {
      evidence_id: 'ev-99'
    });
  });

  it('should get causal chain with defaults', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.getCausalChain('d-1');

    expect(api.get).toHaveBeenCalledWith('/memory/decisions/d-1/causal-chain?direction=both&max_depth=3');
  });

  it('should get causal chain with custom options', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.getCausalChain('d-1', { direction: 'causes', maxDepth: 5 });

    expect(api.get).toHaveBeenCalledWith('/memory/decisions/d-1/causal-chain?direction=causes&max_depth=5');
  });

  it('should find conflicts for a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.findConflicts('d-1');

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/conflicts');
  });

  it('should get fuzzy confidence', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.getFuzzyConfidence('d-1');

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/fuzzy-confidence', {
      decision_id: 'd-1'
    });
  });
});

// ============================================================
// GraphAPI - findShortestPath
// ============================================================

describe('GraphAPI (findShortestPath)', () => {
  it('should find shortest path with defaults', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.findShortestPath('node-a', 'node-b');

    expect(api.get).toHaveBeenCalledWith(
      '/memory/graph/path?start_id=node-a&end_id=node-b&max_hops=5'
    );
  });

  it('should find shortest path with custom max hops', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.findShortestPath('node-a', 'node-b', 3);

    expect(api.get).toHaveBeenCalledWith(
      '/memory/graph/path?start_id=node-a&end_id=node-b&max_hops=3'
    );
  });

  it('should URL-encode node IDs with special characters', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.findShortestPath('a/b', 'c d');

    expect(api.get).toHaveBeenCalledWith(
      '/memory/graph/path?start_id=a%2Fb&end_id=c%20d&max_hops=5'
    );
  });
});

// ============================================================
// GraphAPI - resolveAliases (CORE-GRAPH-ALIAS-RESOLVE-2 B2)
// ============================================================

describe('GraphAPI (resolveAliases)', () => {
  it('should POST with dry_run=false & disambiguate=false by default', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.resolveAliases();

    expect(api.post).toHaveBeenCalledWith(
      '/memory/graph/resolve-aliases?dry_run=false&disambiguate=false'
    );
  });

  it('should POST with dry_run as a query param when set', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.resolveAliases({ dryRun: true });

    expect(api.post).toHaveBeenCalledWith(
      '/memory/graph/resolve-aliases?dry_run=true&disambiguate=false'
    );
  });

  it('should POST with disambiguate as a query param when set (CORE-GRAPH-ALIAS-DISAMBIG-1)', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.resolveAliases({ disambiguate: true });

    expect(api.post).toHaveBeenCalledWith(
      '/memory/graph/resolve-aliases?dry_run=false&disambiguate=true'
    );
  });
});

// ============================================================
// GraphAPI - dedupEntities (CORE-GRAPH-CANONICAL-DEDUP-1)
// ============================================================

describe('GraphAPI (dedupEntities)', () => {
  it('should POST with dry_run=false & require_structural_confirmation=true by default', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.dedupEntities();

    expect(api.post).toHaveBeenCalledWith(
      '/memory/graph/dedup-entities?dry_run=false&require_structural_confirmation=true'
    );
  });

  it('should POST with dry_run as a query param when set', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.dedupEntities({ dryRun: true });

    expect(api.post).toHaveBeenCalledWith(
      '/memory/graph/dedup-entities?dry_run=true&require_structural_confirmation=true'
    );
  });

  it('should POST with require_structural_confirmation=false when opted out', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.dedupEntities({ requireStructuralConfirmation: false });

    expect(api.post).toHaveBeenCalledWith(
      '/memory/graph/dedup-entities?dry_run=false&require_structural_confirmation=false'
    );
  });
});

// ============================================================
// TemporalAPI
// ============================================================

describe('TemporalAPI', () => {
  it('should get history with defaults', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getHistory('item-1');

    expect(api.get).toHaveBeenCalledWith('/memory/temporal/item-1/history?limit=100');
  });

  it('should get history with time range', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getHistory('item-1', { startTime: '2026-01-01', endTime: '2026-02-01', limit: 50 });

    expect(api.get).toHaveBeenCalledWith(
      '/memory/temporal/item-1/history?limit=50&start_time=2026-01-01&end_time=2026-02-01'
    );
  });

  it('should time-travel to a timestamp', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.timeTravel('2026-01-15T00:00:00Z');

    expect(api.get).toHaveBeenCalledWith('/memory/temporal/at/2026-01-15T00:00:00Z?limit=100');
  });

  it('should time-travel with query filter', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.timeTravel('2026-01-15', { query: 'graph db', limit: 10 });

    expect(api.get).toHaveBeenCalledWith(
      '/memory/temporal/at/2026-01-15?limit=10&query=graph%20db'
    );
  });

  it('should get item at time', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getItemAtTime('item-1', '2026-01-15');

    expect(api.get).toHaveBeenCalledWith('/memory/temporal/item-1/at/2026-01-15');
  });

  it('should get changes with filters', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getChanges('item-1', { since: '2026-01-01', changeType: 'update' });

    expect(api.get).toHaveBeenCalledWith(
      '/memory/temporal/item-1/changes?since=2026-01-01&change_type=update'
    );
  });

  it('should get changes with no filters', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getChanges('item-1');

    expect(api.get).toHaveBeenCalledWith('/memory/temporal/item-1/changes');
  });

  it('should compare versions', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.compareVersions('item-1', 1, 3);

    expect(api.post).toHaveBeenCalledWith('/memory/temporal/item-1/compare?v1=1&v2=3');
  });

  it('should rollback to version', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.rollback('item-1', { toVersion: 2 });

    expect(api.post).toHaveBeenCalledWith('/memory/temporal/item-1/rollback?to_version=2');
  });

  it('should rollback to time', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.rollback('item-1', { toTime: '2026-01-01' });

    expect(api.post).toHaveBeenCalledWith('/memory/temporal/item-1/rollback?to_time=2026-01-01');
  });

  it('should get audit trail with filters', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getAuditTrail('item-1', { changeType: 'update', userId: 'u-1' });

    expect(api.get).toHaveBeenCalledWith(
      '/memory/temporal/item-1/audit?change_type=update&user_id=u-1'
    );
  });

  it('should search during range', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.searchDuringRange('graph', '2026-01-01', '2026-02-01', 50);

    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/memory/temporal/search/during?')
    );
    const url = api.get.mock.calls[0][0];
    expect(url).toContain('query=graph');
    expect(url).toContain('start_time=2026-01-01');
    expect(url).toContain('end_time=2026-02-01');
    expect(url).toContain('limit=50');
  });

  it('should generate compliance report', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.complianceReport('2026-01-01', '2026-02-01', { reportType: 'GDPR' });

    expect(api.get).toHaveBeenCalledWith(
      '/memory/temporal/compliance/report?start_date=2026-01-01&end_date=2026-02-01&report_type=GDPR'
    );
  });

  it('should get relationship history', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getRelationshipHistory('rel-1');

    expect(api.get).toHaveBeenCalledWith('/memory/temporal/relationships/rel-1/history');
  });

  it('should get relationships at time', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getRelationshipsAtTime('2026-01-15', 50);

    expect(api.get).toHaveBeenCalledWith('/memory/temporal/relationships/at/2026-01-15?limit=50');
  });

  it('should get relationship valid periods', async () => {
    const api = mockBaseAPI();
    const temporal = new TemporalAPI(api);
    await temporal.getRelationshipValidPeriods('rel-1');

    expect(api.get).toHaveBeenCalledWith('/memory/temporal/relationships/rel-1/valid-periods');
  });
});

// ============================================================
// GovernanceAPI
// ============================================================

describe('GovernanceAPI', () => {
  it('should run analysis with defaults', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.runAnalysis();

    expect(api.post).toHaveBeenCalledWith('/memory/governance/run-analysis', {
      query: '*',
      top_k: 100,
      memory_items: []
    });
  });

  it('should run analysis with custom query', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.runAnalysis({ query: 'security', topK: 50 });

    expect(api.post).toHaveBeenCalledWith('/memory/governance/run-analysis', {
      query: 'security',
      top_k: 50,
      memory_items: []
    });
  });

  it('should list violations with no filters', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.listViolations();

    expect(api.get).toHaveBeenCalledWith('/memory/governance/violations');
  });

  it('should list violations with severity filter', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.listViolations({ severity: 'high', autoFixableOnly: true });

    expect(api.get).toHaveBeenCalledWith(
      '/memory/governance/violations?severity=high&auto_fixable_only=true'
    );
  });

  it('should get a specific violation', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.getViolation('v-1');

    expect(api.get).toHaveBeenCalledWith('/memory/governance/violations/v-1');
  });

  it('should apply decision', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.applyDecision({
      violationId: 'v-1',
      action: 'fix_data',
      rationale: 'Incorrect type',
      decidedBy: 'admin'
    });

    expect(api.post).toHaveBeenCalledWith('/memory/governance/apply-decision', {
      violation_id: 'v-1',
      action: 'fix_data',
      rationale: 'Incorrect type',
      decided_by: 'admin'
    });
  });

  it('should auto-fix with default threshold', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.autoFix();

    expect(api.post).toHaveBeenCalledWith('/memory/governance/auto-fix', {
      confidence_threshold: 0.8
    });
  });

  it('should get summary', async () => {
    const api = mockBaseAPI();
    const gov = new GovernanceAPI(api);
    await gov.getSummary();

    expect(api.get).toHaveBeenCalledWith('/memory/governance/summary');
  });
});

// ============================================================
// EvolutionAPI
// ============================================================

describe('EvolutionAPI', () => {
  it('should trigger evolution', async () => {
    const api = mockBaseAPI();
    const evo = new EvolutionAPI(api);
    await evo.trigger();

    expect(api.post).toHaveBeenCalledWith('/memory/evolution/trigger');
  });

  it('should run dream phase', async () => {
    const api = mockBaseAPI();
    const evo = new EvolutionAPI(api);
    await evo.dream();

    expect(api.post).toHaveBeenCalledWith('/memory/evolution/dream');
  });

  it('should get evolution status', async () => {
    const api = mockBaseAPI();
    const evo = new EvolutionAPI(api);
    await evo.getStatus();

    expect(api.get).toHaveBeenCalledWith('/memory/evolution/status');
  });

  it('should synthesize opinions', async () => {
    const api = mockBaseAPI();
    const evo = new EvolutionAPI(api);
    await evo.synthesizeOpinions();

    expect(api.post).toHaveBeenCalledWith('/memory/evolution/synthesize/opinions');
  });

  it('should synthesize observations', async () => {
    const api = mockBaseAPI();
    const evo = new EvolutionAPI(api);
    await evo.synthesizeObservations();

    expect(api.post).toHaveBeenCalledWith('/memory/evolution/synthesize/observations');
  });

  it('should reinforce opinions', async () => {
    const api = mockBaseAPI();
    const evo = new EvolutionAPI(api);
    await evo.reinforceOpinions();

    expect(api.post).toHaveBeenCalledWith('/memory/evolution/reinforce/opinions');
  });
});

// ============================================================
// ReasoningAPI
// ============================================================

describe('ReasoningAPI', () => {
  it('should challenge an assertion', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.challenge({
      assertion: 'The Earth is flat',
      memoryType: 'semantic',
      useLlm: true
    });

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/challenge', {
      assertion: 'The Earth is flat',
      memory_type: 'semantic',
      use_llm: true
    });
  });

  it('should resolve a conflict', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.resolve({
      existingItemId: 'item-1',
      newFact: 'Updated understanding of gravity',
      autoResolve: false,
      strategy: 'newest_wins'
    });

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/resolve', {
      existing_item_id: 'item-1',
      new_fact: 'Updated understanding of gravity',
      auto_resolve: false,
      strategy: 'newest_wins',
      use_wikipedia: true,
      use_llm: true
    });
  });

  it('should list conflicts with defaults', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.listConflicts();

    expect(api.get).toHaveBeenCalledWith('/memory/reasoning/conflicts?needs_review=true&limit=50');
  });

  it('should get low confidence items', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.getLowConfidence({ threshold: 0.3, limit: 20 });

    expect(api.get).toHaveBeenCalledWith('/memory/reasoning/low-confidence?threshold=0.3&limit=20');
  });

  it('should get confidence history for an item', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.getConfidenceHistory('item-1');

    expect(api.get).toHaveBeenCalledWith('/memory/reasoning/confidence-history/item-1');
  });

  it('should query via semantic/symbolic router', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.query('What databases support graphs?', 5);

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/query', {
      query: 'What databases support graphs?',
      top_k: 5
    });
  });

  it('should build proof tree', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.proof('d-1', 3);

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/proof', {
      decision_id: 'd-1',
      max_depth: 3
    });
  });

  it('should get fuzzy confidence', async () => {
    const api = mockBaseAPI();
    const reasoning = new ReasoningAPI(api);
    await reasoning.fuzzyConfidence('d-1');

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/fuzzy-confidence', {
      decision_id: 'd-1'
    });
  });
});

// ============================================================
// ReasoningTracesAPI
// ============================================================

describe('ReasoningTracesAPI', () => {
  it('should extract reasoning traces', async () => {
    const api = mockBaseAPI();
    const traces = new ReasoningTracesAPI(api);
    await traces.extract({
      content: 'First, we consider A. Then, we conclude B.',
      minSteps: 3,
      minQualityScore: 0.6
    });

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/traces/extract', {
      content: 'First, we consider A. Then, we conclude B.',
      min_steps: 3,
      min_quality_score: 0.6,
      use_llm_detection: true
    });
  });

  it('should store a reasoning trace', async () => {
    const api = mockBaseAPI();
    const traces = new ReasoningTracesAPI(api);
    const traceObj = { steps: ['A', 'B'], conclusion: 'C' };
    await traces.store({ trace: traceObj, artifactIds: ['art-1'] });

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/traces/store', {
      trace: traceObj,
      artifact_ids: ['art-1']
    });
  });

  it('should query reasoning traces', async () => {
    const api = mockBaseAPI();
    const traces = new ReasoningTracesAPI(api);
    await traces.query({ query: 'database migration', artifactId: 'art-1', limit: 5 });

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/traces/query', {
      query: 'database migration',
      artifact_id: 'art-1',
      limit: 5
    });
  });

  it('should get a trace by ID', async () => {
    const api = mockBaseAPI();
    const traces = new ReasoningTracesAPI(api);
    await traces.get('trace-42');

    expect(api.get).toHaveBeenCalledWith('/memory/reasoning/traces/trace-42');
  });
});

// ============================================================
// OntologyAPI
// ============================================================

describe('OntologyAPI', () => {
  // --- Inference ---
  it('should run inference', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.runInference({
      rawChunks: [{ docId: 'doc-1', text: 'FalkorDB is a graph database' }]
    });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/inference/run', {
      registry_id: 'default',
      raw_chunks: [{ doc_id: 'doc-1', text: 'FalkorDB is a graph database' }],
      params: {}
    });
  });

  // --- Registry Management ---
  it('should list registries', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.listRegistries();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registries');
  });

  it('should create a registry', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.createRegistry({ name: 'tech', description: 'Technology ontology', domain: 'engineering' });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/registries', {
      name: 'tech',
      description: 'Technology ontology',
      domain: 'engineering'
    });
  });

  it('should get snapshot', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getSnapshot('reg-1');

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/snapshot');
  });

  it('should get snapshot at version', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getSnapshot('reg-1', 'v2');

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/snapshot?version=v2');
  });

  it('should apply changeset', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    const changeset = { add_types: [{ name: 'Database' }] };
    await ontology.applyChangeset('reg-1', { changeset, message: 'Add Database type' });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/apply', {
      base_version: '',
      changeset,
      message: 'Add Database type'
    });
  });

  it('should list snapshots', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.listSnapshots('reg-1', 20);

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/snapshots?limit=20');
  });

  it('should get changelog', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getChangelog('reg-1');

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/changelog?limit=50');
  });

  it('should rollback registry', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.rollbackRegistry('reg-1', { targetVersion: 'v1', message: 'Rollback to v1' });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/rollback', {
      target_version: 'v1',
      message: 'Rollback to v1'
    });
  });

  it('should export registry', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.exportRegistry('reg-1');

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/export');
  });

  it('should import into registry', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.importRegistry('reg-1', { data: { types: [] }, message: 'Import' });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/import', {
      data: { types: [] },
      message: 'Import'
    });
  });

  // --- Enrichment & Grounding ---
  it('should list enrichment providers', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.listEnrichmentProviders();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/enrichment/providers');
  });

  it('should run enrichment', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.runEnrichment({ provider: 'wikidata', entities: ['FalkorDB', 'Redis'] });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/enrichment/run', {
      provider: 'wikidata',
      entities: ['FalkorDB', 'Redis']
    });
  });

  it('should run grounding', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.runGrounding({ itemId: 'item-1', candidates: ['Q1', 'Q2'] });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/grounding/run', {
      grounder: 'wikipedia',
      item_id: 'item-1',
      candidates: ['Q1', 'Q2']
    });
  });

  // --- Templates ---
  it('should list templates', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.listTemplates();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/templates');
  });

  it('should get template', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getTemplate('tpl-1');

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/templates/tpl-1');
  });

  it('should clone template', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.cloneTemplate({ templateId: 'tpl-1', targetName: 'my-ontology' });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/templates/clone', {
      template_id: 'tpl-1',
      target_name: 'my-ontology'
    });
  });

  it('should save as template', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.saveAsTemplate({ registryId: 'reg-1', name: 'My Template', description: 'Desc' });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/templates', {
      registry_id: 'reg-1',
      name: 'My Template',
      description: 'Desc'
    });
  });

  it('should delete template', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.deleteTemplate('tpl-1');

    expect(api.delete).toHaveBeenCalledWith('/memory/ontology/templates/tpl-1');
  });

  // --- Patterns ---
  it('should list patterns', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.listPatterns();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/patterns');
  });

  it('should create pattern', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.createPattern({ name: 'Redis', entityType: 'Technology', confidence: 0.95 });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/patterns', {
      name: 'Redis',
      entity_type: 'Technology',
      confidence: 0.95,
      is_global: false
    });
  });

  it('should delete pattern', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.deletePattern('Redis', 'Technology');

    expect(api.delete).toHaveBeenCalledWith('/memory/ontology/patterns/Redis?entity_type=Technology');
  });

  // --- Status & Import/Export ---
  it('should get status', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getStatus();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/status');
  });

  it('should import ontology', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.importOntology({ types: [{ name: 'Person' }] });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/import', {
      data: { types: [{ name: 'Person' }] }
    });
  });

  it('should export ontology', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.exportOntology();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/export');
  });

  // --- Layer endpoints ---
  it('should subscribe to base ontology', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.subscribe('overlay-1', { baseRegistryId: 'base-1' });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/registry/overlay-1/subscribe', {
      base_registry_id: 'base-1',
      pinned_version: null
    });
  });

  it('should unsubscribe from base', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.unsubscribe('overlay-1');

    expect(api.delete).toHaveBeenCalledWith('/memory/ontology/registry/overlay-1/subscribe');
  });

  it('should pin version', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.pinVersion('overlay-1', 'v3');

    expect(api.put).toHaveBeenCalledWith('/memory/ontology/registry/overlay-1/subscribe/pin', {
      version: 'v3'
    });
  });

  it('should unpin version', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.unpinVersion('overlay-1');

    expect(api.delete).toHaveBeenCalledWith('/memory/ontology/registry/overlay-1/subscribe/pin');
  });

  it('should get layers', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getLayers('reg-1');

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/layers');
  });

  it('should get layer diff', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getLayerDiff('reg-1');

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/layer-diff');
  });

  it('should hide type', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.hideType('reg-1', 'DeprecatedType');

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/subscribe/hidden', {
      type_name: 'DeprecatedType'
    });
  });

  it('should unhide type', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.unhideType('reg-1', 'DeprecatedType');

    expect(api.delete).toHaveBeenCalledWith('/memory/ontology/registry/reg-1/subscribe/hidden/DeprecatedType');
  });

  // --- Ontology Update ---
  it('should get update config', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getUpdateConfig();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/updates/config');
  });

  it('should update config', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.updateConfig({ enabled: true, schedule: 'daily', batchSize: 50 });

    expect(api.patch).toHaveBeenCalledWith('/memory/ontology/updates/config', {
      enabled: true,
      schedule: 'daily',
      batch_size: 50
    });
  });

  it('should trigger update', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.triggerUpdate({ batchSize: 25 });

    expect(api.post).toHaveBeenCalledWith('/memory/ontology/updates/trigger', {
      batch_size: 25
    });
  });

  it('should get update status', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getUpdateStatus();

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/updates/status');
  });

  it('should get update history', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getUpdateHistory({ page: 2, pageSize: 20 });

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/updates/history?page=2&page_size=20');
  });

  it('should get update stats', async () => {
    const api = mockBaseAPI();
    const ontology = new OntologyAPI(api);
    await ontology.getUpdateStats({ history: true });

    expect(api.get).toHaveBeenCalledWith('/memory/ontology/updates/stats?history=true');
  });
});

// ============================================================
// AnalyticsAPI
// ============================================================

describe('AnalyticsAPI', () => {
  it('should get analytics status', async () => {
    const api = mockBaseAPI();
    const analytics = new AnalyticsAPI(api);
    await analytics.getStatus();

    expect(api.get).toHaveBeenCalledWith('/memory/analytics/status');
  });

  it('should detect drift with default window', async () => {
    const api = mockBaseAPI();
    const analytics = new AnalyticsAPI(api);
    await analytics.detectDrift();

    expect(api.get).toHaveBeenCalledWith('/memory/analytics/drift?time_window_days=30');
  });

  it('should detect drift with custom window', async () => {
    const api = mockBaseAPI();
    const analytics = new AnalyticsAPI(api);
    await analytics.detectDrift(7);

    expect(api.get).toHaveBeenCalledWith('/memory/analytics/drift?time_window_days=7');
  });

  it('should detect bias with defaults', async () => {
    const api = mockBaseAPI();
    const analytics = new AnalyticsAPI(api);
    await analytics.detectBias();

    expect(api.post).toHaveBeenCalledWith('/memory/analytics/bias', {});
  });

  it('should detect bias with options', async () => {
    const api = mockBaseAPI();
    const analytics = new AnalyticsAPI(api);
    await analytics.detectBias({
      protectedAttributes: ['gender', 'age'],
      sentimentAnalysis: true,
      topicAnalysis: false
    });

    expect(api.post).toHaveBeenCalledWith('/memory/analytics/bias', {
      protected_attributes: ['gender', 'age'],
      sentiment_analysis: true,
      topic_analysis: false
    });
  });
});

// ============================================================
// ValidationAPI
// ============================================================

describe('ValidationAPI', () => {
  it('should get graph health', async () => {
    const api = mockBaseAPI();
    const validation = new ValidationAPI(api);
    await validation.getHealth();

    expect(api.get).toHaveBeenCalledWith('/memory/graph/health');
  });

  it('should validate an item', async () => {
    const api = mockBaseAPI();
    const validation = new ValidationAPI(api);
    await validation.validateItem('item-1');

    expect(api.post).toHaveBeenCalledWith('/memory/validate', {
      item_id: 'item-1'
    });
  });

  it('should run inference with dry run', async () => {
    const api = mockBaseAPI();
    const validation = new ValidationAPI(api);
    await validation.runInference({ dryRun: true });

    expect(api.post).toHaveBeenCalledWith('/memory/inference', {
      dry_run: true
    });
  });

  it('should get inference rules', async () => {
    const api = mockBaseAPI();
    const validation = new ValidationAPI(api);
    await validation.getInferenceRules();

    expect(api.get).toHaveBeenCalledWith('/memory/inference/rules');
  });
});

// ============================================================
// PipelineAPI
// ============================================================

describe('PipelineAPI', () => {
  it('should run extraction', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.runExtraction({ content: 'text', options: {} });

    expect(api.post).toHaveBeenCalledWith('/memory/pipeline/extraction', {
      content: 'text',
      options: {}
    });
  });

  it('should run storage', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.runStorage({ items: [] });

    expect(api.post).toHaveBeenCalledWith('/memory/pipeline/storage', { items: [] });
  });

  it('should run linking', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.runLinking({ items: [] });

    expect(api.post).toHaveBeenCalledWith('/memory/pipeline/linking', { items: [] });
  });

  it('should run enrichment', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.runEnrichment({ items: [] });

    expect(api.post).toHaveBeenCalledWith('/memory/pipeline/enrichment', { items: [] });
  });

  it('should run grounding', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.runGrounding({ items: [] });

    expect(api.post).toHaveBeenCalledWith('/memory/pipeline/grounding', { items: [] });
  });

  it('should get pipeline state', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.getState('pipe-1');

    expect(api.get).toHaveBeenCalledWith('/memory/pipeline/pipe-1/state');
  });

  it('should get pipeline state with run ID', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.getState('pipe-1', 'run-42');

    expect(api.get).toHaveBeenCalledWith('/memory/pipeline/pipe-1/state?run_id=run-42');
  });

  it('should reset pipeline', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.reset('pipe-1');

    expect(api.delete).toHaveBeenCalledWith('/memory/pipeline/pipe-1');
  });

  it('should clear pipeline run', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.clearRun('pipe-1', 'run-42');

    expect(api.delete).toHaveBeenCalledWith('/memory/pipeline/pipe-1/run/run-42');
  });

  it('should list configs', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.listConfigs();

    expect(api.get).toHaveBeenCalledWith('/memory/pipeline/configs');
  });

  it('should create config', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.createConfig({ name: 'default', description: 'Default config', config: { steps: [] } });

    expect(api.post).toHaveBeenCalledWith('/memory/pipeline/configs', {
      name: 'default',
      description: 'Default config',
      config: { steps: [] }
    });
  });

  it('should get config', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.getConfig('default');

    expect(api.get).toHaveBeenCalledWith('/memory/pipeline/configs/default');
  });

  it('should update config', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.updateConfig('default', { name: 'default', description: 'Updated', config: { steps: ['extract'] } });

    expect(api.patch).toHaveBeenCalledWith('/memory/pipeline/configs/default', {
      name: 'default',
      description: 'Updated',
      config: { steps: ['extract'] }
    });
  });

  it('should delete config', async () => {
    const api = mockBaseAPI();
    const pipeline = new PipelineAPI(api);
    await pipeline.deleteConfig('default');

    expect(api.delete).toHaveBeenCalledWith('/memory/pipeline/configs/default');
  });
});

// ============================================================
// ArchiveAPI
// ============================================================

describe('ArchiveAPI', () => {
  it('should store an artifact', async () => {
    const api = mockBaseAPI();
    const archive = new ArchiveAPI(api);
    await archive.store({
      conversationId: 'conv-1',
      payload: { key: 'value' },
      metadata: { source: 'test' }
    });

    expect(api.post).toHaveBeenCalledWith('/memory/archive/store', {
      conversation_id: 'conv-1',
      payload: { key: 'value' },
      metadata: { source: 'test' }
    });
  });

  it('should retrieve an artifact by URI', async () => {
    const api = mockBaseAPI();
    const archive = new ArchiveAPI(api);
    await archive.get('archive://conv-1/abc123');

    expect(api.get).toHaveBeenCalledWith('/memory/archive/archive://conv-1/abc123');
  });
});

// ============================================================
// ZettelkastenAPI
// ============================================================

describe('ZettelkastenAPI', () => {
  // --- Bidirectional Linking ---
  it('should get backlinks', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getBacklinks('note-1');

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/backlinks');
  });

  it('should get forward links', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getForwardLinks('note-1');

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/forward-links');
  });

  it('should get connections', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getConnections('note-1');

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/connections');
  });

  // --- Emergent Structure ---
  it('should get clusters with defaults', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getClusters();

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/clusters?min_size=3&algorithm=louvain');
  });

  it('should get hubs', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getHubs({ minConnections: 10, limit: 5 });

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/hubs?min_connections=10&limit=5');
  });

  it('should get bridges', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getBridges(10);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/bridges?limit=10');
  });

  // --- Discovery ---
  it('should get discoveries', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getDiscoveries('note-1', { maxDistance: 5, minSurprise: 0.7 });

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/discoveries?max_distance=5&min_surprise=0.7');
  });

  it('should get path between notes', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getPath('note-1', 'note-2', 3);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/path/note-2?max_paths=3');
  });

  // --- Wikilink Support ---
  it('should parse wikilinks', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.parseWikilinks('See [[FalkorDB]] for details');

    expect(api.post).toHaveBeenCalledWith(
      '/memory/zettel/wikilink/parse?auto_create=true',
      'See [[FalkorDB]] for details'
    );
  });

  it('should resolve wikilink', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.resolveWikilink('FalkorDB');

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/wikilink/resolve?link=FalkorDB');
  });

  // --- Graph Visualization ---
  it('should get subgraph', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.getSubgraph('note-1', { depth: 3, includeMetadata: false });

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/graph?depth=3&include_metadata=false');
  });

  // --- Additional Discovery ---
  it('should detect concept emergence', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.detectConceptEmergence(10);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/concept-emergence?limit=10');
  });

  it('should suggest related notes', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.suggestRelated('note-1', 3);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/suggestions?count=3');
  });

  it('should perform random walk', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.randomWalk('note-1', 10);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/note-1/random-walk?length=10');
  });

  // --- Query Features ---
  it('should find by tag', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.findByTag('database', 50);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/by-tag/database?limit=50');
  });

  it('should find by property', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.findByProperty('status', 'active', 25);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/by-property?key=status&value=active&limit=25');
  });

  it('should find mentioning entity', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.findMentioning('entity-1', 50);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/mentioning/entity-1?limit=50');
  });

  it('should query by relation', async () => {
    const api = mockBaseAPI();
    const zettel = new ZettelkastenAPI(api);
    await zettel.queryByRelation('src-1', 'DEPENDS_ON', 30);

    expect(api.get).toHaveBeenCalledWith('/memory/zettel/by-relation/src-1/DEPENDS_ON?limit=30');
  });
});

// ============================================================
// ProcedureMatchAPI (CFS-2)
// ============================================================

describe('ProcedureMatchAPI', () => {
  it('should list procedure matches with no params', async () => {
    const api = mockBaseAPI();
    const pm = new ProcedureMatchAPI(api);
    await pm.list();

    expect(api.get).toHaveBeenCalledWith('/memory/procedures/matches');
  });

  it('should list procedure matches with filters', async () => {
    const api = mockBaseAPI();
    const pm = new ProcedureMatchAPI(api);
    await pm.list({
      start_date: '2026-02-01',
      end_date: '2026-02-12',
      procedure_id: 'proc-1',
      feedback: 'success',
      limit: 50
    });

    const url = api.get.mock.calls[0][0];
    expect(url).toContain('/memory/procedures/matches?');
    expect(url).toContain('start_date=2026-02-01');
    expect(url).toContain('end_date=2026-02-12');
    expect(url).toContain('procedure_id=proc-1');
    expect(url).toContain('feedback=success');
    expect(url).toContain('limit=50');
  });

  it('should omit null and undefined params from list query', async () => {
    const api = mockBaseAPI();
    const pm = new ProcedureMatchAPI(api);
    await pm.list({ feedback: null, procedure_id: undefined, limit: 10 });

    const url = api.get.mock.calls[0][0];
    expect(url).toContain('limit=10');
    expect(url).not.toContain('feedback');
    expect(url).not.toContain('procedure_id');
    expect(url).not.toContain('null');
    expect(url).not.toContain('undefined');
  });

  it('should submit feedback without note', async () => {
    const api = mockBaseAPI();
    const pm = new ProcedureMatchAPI(api);
    await pm.submitFeedback('match-1', 'success');

    expect(api.post).toHaveBeenCalledWith(
      '/memory/procedures/matches/match-1/feedback',
      { feedback: 'success' }
    );
  });

  it('should submit feedback with note', async () => {
    const api = mockBaseAPI();
    const pm = new ProcedureMatchAPI(api);
    await pm.submitFeedback('match-1', 'failure', 'Wrong profile selected');

    expect(api.post).toHaveBeenCalledWith(
      '/memory/procedures/matches/match-1/feedback',
      { feedback: 'failure', note: 'Wrong profile selected' }
    );
  });

  it('should get procedure match stats', async () => {
    const api = mockBaseAPI();
    const pm = new ProcedureMatchAPI(api);
    await pm.getStats();

    expect(api.get).toHaveBeenCalledWith('/memory/procedures/matches/stats');
  });
});

// ============================================================
// ProcedureCandidateAPI (CFS-3b)
// ============================================================

describe('ProcedureCandidateAPI', () => {
  it('should list candidates with no params', async () => {
    const api = mockBaseAPI();
    const pc = new ProcedureCandidateAPI(api);
    await pc.list();

    expect(api.get).toHaveBeenCalledWith('/memory/procedures/candidates');
  });

  it('should list candidates with all params', async () => {
    const api = mockBaseAPI();
    const pc = new ProcedureCandidateAPI(api);
    await pc.list({
      min_score: 0.8,
      min_cluster_size: 5,
      days_back: 14,
      limit: 10
    });

    const url = api.get.mock.calls[0][0];
    expect(url).toContain('/memory/procedures/candidates?');
    expect(url).toContain('min_score=0.8');
    expect(url).toContain('min_cluster_size=5');
    expect(url).toContain('days_back=14');
    expect(url).toContain('limit=10');
  });

  it('should omit null/undefined params from list query', async () => {
    const api = mockBaseAPI();
    const pc = new ProcedureCandidateAPI(api);
    await pc.list({ min_score: null, days_back: undefined, limit: 5 });

    const url = api.get.mock.calls[0][0];
    expect(url).toContain('limit=5');
    expect(url).not.toContain('min_score');
    expect(url).not.toContain('days_back');
    expect(url).not.toContain('null');
    expect(url).not.toContain('undefined');
  });

  it('should promote with defaults', async () => {
    const api = mockBaseAPI();
    const pc = new ProcedureCandidateAPI(api);
    await pc.promote('cluster-123');

    expect(api.post).toHaveBeenCalledWith(
      '/memory/procedures/candidates/cluster-123/promote',
      {
        name: null,
        description: null,
        procedure_type: 'extraction',
        preferred_profile: 'quick_extract',
        remove_working_items: false
      }
    );
  });

  it('should promote with all options', async () => {
    const api = mockBaseAPI();
    const pc = new ProcedureCandidateAPI(api);
    await pc.promote('cluster-456', {
      name: 'API Error Handler',
      description: 'Handles 4xx errors',
      procedure_type: 'validation',
      preferred_profile: 'full_extract',
      remove_working_items: true
    });

    expect(api.post).toHaveBeenCalledWith(
      '/memory/procedures/candidates/cluster-456/promote',
      {
        name: 'API Error Handler',
        description: 'Handles 4xx errors',
        procedure_type: 'validation',
        preferred_profile: 'full_extract',
        remove_working_items: true
      }
    );
  });

  it('should dismiss a candidate', async () => {
    const api = mockBaseAPI();
    const pc = new ProcedureCandidateAPI(api);
    await pc.dismiss('cluster-789');

    expect(api.delete).toHaveBeenCalledWith(
      '/memory/procedures/candidates/cluster-789/dismiss'
    );
  });
});

// ============================================================
// ProcedureDriftAPI — Schema Drift Detection (CFS-4)
// ============================================================

describe('ProcedureDriftAPI', () => {
  it('should list drift events with no params', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.list();
    expect(api.get).toHaveBeenCalledWith('/memory/procedures/drift');
  });

  it('should list drift events with all params', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.list({
      procedure_id: 'proc-1',
      resolved: false,
      breaking_only: true,
      start_date: '2026-02-01',
      end_date: '2026-02-13',
      limit: 50
    });
    const url = api.get.mock.calls[0][0];
    expect(url).toContain('/memory/procedures/drift?');
    expect(url).toContain('procedure_id=proc-1');
    expect(url).toContain('resolved=false');
    expect(url).toContain('breaking_only=true');
    expect(url).toContain('start_date=2026-02-01');
    expect(url).toContain('end_date=2026-02-13');
    expect(url).toContain('limit=50');
  });

  it('should omit null/undefined params from list', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.list({ procedure_id: null, resolved: undefined, limit: 25 });
    const url = api.get.mock.calls[0][0];
    expect(url).toContain('limit=25');
    expect(url).not.toContain('procedure_id');
    expect(url).not.toContain('resolved');
  });

  it('should get a single drift event', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.get('evt-abc-123');
    expect(api.get).toHaveBeenCalledWith('/memory/procedures/drift/evt-abc-123');
  });

  it('should resolve a drift event with note', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.resolve('evt-abc-123', 'Schema updated intentionally');
    expect(api.post).toHaveBeenCalledWith(
      '/memory/procedures/drift/evt-abc-123/resolve',
      { note: 'Schema updated intentionally' }
    );
  });

  it('should resolve a drift event without note', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.resolve('evt-abc-123');
    expect(api.post).toHaveBeenCalledWith(
      '/memory/procedures/drift/evt-abc-123/resolve',
      {}
    );
  });

  it('should trigger a drift sweep', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.sweep();
    expect(api.post).toHaveBeenCalledWith('/memory/procedures/drift/sweep', {});
  });

  it('should list schema snapshots for a procedure', async () => {
    const api = mockBaseAPI();
    const pd = new ProcedureDriftAPI(api);
    await pd.listSnapshots('proc-abc-123');
    expect(api.get).toHaveBeenCalledWith('/memory/procedures/schemas/proc-abc-123');
  });
});
