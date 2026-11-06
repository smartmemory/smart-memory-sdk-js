// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { APIError } from '../../../src/errors/APIError.js';

// Anchored assignments are consumed by docs/contract-consumers.json's pin scanner.
let SCOPED_VALIDITY_VERSION, FIXTURES_DIGEST;
SCOPED_VALIDITY_VERSION = 2;
FIXTURES_DIGEST = "a4756030405465024f25ba7ba1665b4fd8e1e3cf2972b63ae6e1c8107561aa07";

const at = new Date('2026-02-08T00:00:00Z');
const businessScope = { site: 'A & B/+' };
const scopeGoLives = [{ scope: businessScope, valid_from: at }];
const wireSchedule = [{ scope: businessScope, valid_from: at.toISOString() }];
// A recording transport tests pure serialization only. The golden group below uses real fetch.
function recording() {
  const requests = [];
  const api = Object.fromEntries(['get', 'post'].map(method => [method, async (...args) => {
    requests.push({ method, args });
    return args;
  }]));
  return { memory: new MemoryAPI(api), decisions: new DecisionAPI(api), requests };
}
function query(path) { return new URL(path, 'https://serialization.invalid').searchParams; }

describe('serialization', () => {
  it('maps memory search qualifiers, Dates and independent transaction time', async () => {
    const { memory, requests } = recording();
    await memory.search('CRF', { businessScope, validAt: at, asOfDate: at });
    expect(requests[0].args).toEqual(['/memory/search', {
      query: 'CRF', top_k: 5, enable_hybrid: true, business_scope: businessScope,
      valid_at: at.toISOString(), as_of_date: at.toISOString(),
    }]);
  });
  it('maps both generic replacement forms without mutating the caller schedule', async () => {
    const { memory, requests } = recording();
    await memory.supersede('old/+', { content: 'amendment', reason: 'rollout', scopeGoLives });
    await memory.supersedeLink('old/+', 'new', 'rollout', { scopeGoLives });
    expect(requests[0].args).toEqual(['/memory/old%2F%2B/supersede', {
      content: 'amendment', memory_type: undefined, metadata: {}, reason: 'rollout', scope_go_lives: wireSchedule,
    }]);
    expect(requests[1].args).toEqual(['/memory/old%2F%2B/supersede-link', {
      new_item_id: 'new', reason: 'rollout', scope_go_lives: wireSchedule,
    }]);
    expect(scopeGoLives[0].valid_from).toBe(at);
  });
  it('maps scalar validFrom on generic and decision writes', async () => {
    const { memory, decisions, requests } = recording();
    await memory.supersede('old', { content: 'new', validFrom: at });
    await memory.supersedeLink('old', 'new', null, { validFrom: at });
    await decisions.supersede('old', { new_content: 'new', reason: 'global', validFrom: at });
    for (const request of requests) expect(request.args[1].valid_from).toBe(at.toISOString());
  });
  it('maps decision create and replacement schedules with snake_case nested fields', async () => {
    const { decisions, requests } = recording();
    await decisions.create({ content: 'CRF', scopeGoLives });
    await decisions.supersede('old', { new_content: 'new', reason: 'rollout', scopeGoLives });
    for (const request of requests) {
      expect(request.args[1].scope_go_lives).toEqual(wireSchedule);
      expect(request.args[1]).not.toHaveProperty('scopeGoLives');
    }
  });
  it.each(['list', 'search', 'get', 'getProvenance'])('encodes decision %s qualifiers exactly once', async method => {
    const { decisions, requests } = recording();
    const options = { businessScope, validAt: at, asOf: at };
    if (method === 'list') await decisions.list({ domain: 'CRF', ...options });
    else if (method === 'search') await decisions.search('CRF & +', 7, options);
    else await decisions[method]('old', options);
    const path = requests[0].args[0];
    expect(path).not.toContain('/?');
    const params = query(path);
    expect(JSON.parse(params.get('business_scope'))).toEqual(businessScope);
    expect(params.get('valid_at')).toBe(at.toISOString());
    expect(params.get('as_of')).toBe(at.toISOString());
    expect(params.has('businessScope')).toBe(false);
    if (method === 'search') expect(params.get('topic')).toBe('CRF & +');
  });
  it('keeps omitted/null qualifiers and legacy request shapes unchanged', async () => {
    const { memory, decisions, requests } = recording();
    await memory.search('CRF', { businessScope: null, validAt: undefined });
    expect(requests.at(-1).args[1]).toEqual({ query: 'CRF', top_k: 5, enable_hybrid: true });
    await memory.supersedeLink('old', 'new');
    expect(requests.at(-1).args[1]).toEqual({ new_item_id: 'new', reason: null });
    await decisions.get('old', { businessScope: null, validAt: null });
    expect(requests.at(-1).args[0]).toBe('/memory/decisions/old');
    await decisions.supersede('old', { new_content: 'new', reason: 'legacy' });
    expect(requests.at(-1).args[1]).toEqual({ new_content: 'new', reason: 'legacy' });
  });
  it.each(['metadata_filter', 'business_scope', 'valid_at', 'businessScopes'])('rejects unknown search option %s before sending', async name => {
    const { memory, requests } = recording();
    await expect(memory.search('', { [name]: {} })).rejects.toThrow(/option/i);
    expect(requests).toEqual([]);
  });
  it('does not retry or transform typed write errors', async () => {
    const error = new APIError('conflict', 409, { detail: { code: 'scoped_validity_conflict' } });
    let calls = 0;
    const decisions = new DecisionAPI({ post: async () => { calls++; throw error; } });
    await expect(decisions.supersede('old', { new_content: 'new', scopeGoLives })).rejects.toBe(error);
    expect(calls).toBe(1);
  });
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

describe('real local service golden', { timeout: 30000 }, () => {
  let memory, decisions, foreign, otherWorkspace, base, fixture;
  const ids = {};
  beforeAll(() => {
    const url = process.env.SCOPED_VALIDITY_SERVICE_URL;
    if (!url) throw new Error('SCOPED_VALIDITY_SERVICE_URL is required for golden rows. Select serialization explicitly for pure cases.');
    fixture = JSON.parse(readFileSync(process.env.SCOPED_VALIDITY_FIXTURES, 'utf8'));
    expect(fixture.version).toBe(SCOPED_VALIDITY_VERSION);
    expect(createHash('sha256').update(canonical(fixture)).digest('hex')).toBe(FIXTURES_DIGEST);
    const client = headers => new BaseAPI({ apiBaseUrl: url, getAuthHeaders: (extra = {}) => ({ ...extra, ...headers }), getRequestOptions: o => o });
    base = client(JSON.parse(process.env.SCOPED_VALIDITY_HEADERS));
    memory = new MemoryAPI(base);
    decisions = new DecisionAPI(base);
    foreign = new DecisionAPI(client(JSON.parse(process.env.SCOPED_VALIDITY_FOREIGN_HEADERS)));
    otherWorkspace = new DecisionAPI(client(JSON.parse(process.env.SCOPED_VALIDITY_WORKSPACE_HEADERS)));
  });
  const opts = (site, validAt = at) => ({ ...(site ? { businessScope: { site } } : {}), validAt });
  it('G01-G05 creates one rollout and resolves every canonical boundary', async () => {
    ids.v1 = (await decisions.create({ content: fixture.versions[0].content, scopeGoLives: fixture.versions[0].scope_go_lives })).decision_id;
    const receipt = await decisions.supersede(ids.v1, { new_content: fixture.versions[1].content, reason: 'test_scoped_u10 rollout', scopeGoLives: fixture.versions[1].scope_go_lives });
    expect(receipt.status).toBe('scheduled');
    ids.v2 = receipt.new_item_id;
    expect(receipt.scope_go_lives).toHaveLength(2);
    for (const row of fixture.queries) {
      const found = await decisions.get(ids.v2, opts(row.site, row.valid_at));
      expect(found.decision_id, JSON.stringify(row)).toBe(ids[row.expected]);
      expect(found.content).toBe(fixture.versions.find(v => v.id === row.expected).content);
    }
  });
  it('G06 top-one search uses predecessor content and all decision read surfaces agree', async () => {
    for (const [site, version] of [['A', 'v2'], ['B', 'v1'], [null, 'v1']]) {
      const found = await memory.search(fixture.versions[1].content, { topK: 1, memoryType: 'decision', ...opts(site) });
      expect(found.results.map(r => r.item_id)).toEqual([ids[version]]);
      expect(found.results[0].content).toBe(fixture.versions.find(v => v.id === version).content);
      expect((await decisions.list(opts(site))).decisions.map(d => d.decision_id)).toEqual([ids[version]]);
      expect((await decisions.search('CRF guidance', 20, opts(site))).decisions.map(d => d.decision_id)).toEqual([ids[version]]);
      expect((await decisions.getProvenance(ids.v1, opts(site))).decision.decision_id).toBe(ids[version]);
    }
  });
  it('G07 same business keys cannot cross tenants or workspaces', async () => {
    for (const client of [foreign, otherWorkspace]) {
      const own = await client.create({ content: 'test_scoped_u10 foreign CRF', scopeGoLives: fixture.versions[0].scope_go_lives });
      expect((await client.get(own.decision_id, opts('A'))).decision_id).toBe(own.decision_id);
      await expect(client.get(ids.v1, opts('A'))).rejects.toMatchObject({ status: 404 });
      expect((await client.list(opts('A'))).decisions.map(d => d.decision_id)).toEqual([own.decision_id]);
    }
  });
  it('G11 invalid schedules and conflicts preserve typed status/detail', async () => {
    for (const schedule of [[], fixture.versions[1].scope_go_lives.concat(fixture.versions[1].scope_go_lives), [{ scope: { country: 'US' }, valid_from: at }]]) {
      await expect(decisions.supersede(ids.v1, { new_content: 'rejected', reason: 'invalid', scopeGoLives: schedule }))
        .rejects.toMatchObject({ name: 'APIError', status: 400, detail: { detail: { code: 'invalid_scoped_validity' } } });
    }
    await expect(decisions.supersede(ids.v1, { new_content: 'conflict', reason: 'conflict', scopeGoLives: [{ scope: { site: 'A' }, valid_from: at }] }))
      .rejects.toMatchObject({ status: 409, detail: { detail: { code: 'scoped_validity_conflict' } } });
  });
  it('G16 missing date uses now and invalid qualifiers refuse even an empty query', async () => {
    expect((await decisions.get(ids.v1, { businessScope: { site: 'A' } })).decision_id).toBe(ids.v2);
    for (const options of [{ businessScope: { country: 'US' } }, { validAt: 'bad' }, { ...opts('A'), includeSuperseded: true }]) {
      await expect(memory.search('', options)).rejects.toMatchObject({ status: 400, detail: { detail: { code: 'invalid_scoped_validity' } } });
    }
  });
  it('both generic replacement forms return scheduled receipts and resolve through search', async () => {
    const schedule = fixture.versions[1].scope_go_lives.map(entry => ({ ...entry, valid_from: entry.valid_from.replace('2026', '2029') }));
    for (const mode of ['create', 'link']) {
      const old = await base.post('/memory/add', { content: `test_scoped_u10 ${mode} original`, memory_type: 'semantic', use_pipeline: false });
      const oldId = old.id || old.item_id;
      let receipt;
      if (mode === 'create') receipt = await memory.supersede(oldId, { content: `test_scoped_u10 ${mode} amendment`, memoryType: 'semantic', reason: 'rollout', scopeGoLives: schedule });
      else {
        const next = await base.post('/memory/add', { content: `test_scoped_u10 ${mode} amendment`, memory_type: 'semantic', use_pipeline: false });
        receipt = await memory.supersedeLink(oldId, next.id || next.item_id, 'rollout', { scopeGoLives: schedule });
      }
      expect(receipt.status).toBe('scheduled');
      expect(receipt.old_item_id).toBe(oldId);
      expect(receipt.scope_go_lives).toEqual(schedule.map(entry => ({ ...entry, valid_from: entry.valid_from.replace('Z', '+00:00') })));
      const found = await memory.search(`test_scoped_u10 ${mode} amendment`, { topK: 20, memoryType: 'semantic', ...opts('B', '2029-02-08T00:00:00Z') });
      expect(found.results.map(r => r.item_id)).toContain(oldId);
      expect(found.results.map(r => r.item_id)).not.toContain(receipt.new_item_id);
    }
  });
  it('G12 transaction time chooses the schedule revision independently of validAt', async () => {
    const before = new Date();
    await memory.update(ids.v2, { properties: { scope_go_lives: [{ scope: { site: 'A' }, valid_from: '2026-02-10T00:00:00Z' }, fixture.versions[1].scope_go_lives[1]] } });
    for (const [asOf, version] of [[before, 'v2'], [new Date(), 'v1']]) {
      expect((await decisions.get(ids.v1, { ...opts('A'), asOf })).decision_id).toBe(ids[version]);
      const found = await memory.search('*', { topK: 1, memoryType: 'decision', ...opts('A'), asOfDate: asOf });
      expect(found.results.map(r => r.item_id)).toEqual([ids[version]]);
    }
  });
  it('G08 legacy global replacements and omitted qualifiers remain compatible', async () => {
    const old = (await decisions.create({ content: 'test_scoped_u10 legacy' })).decision_id;
    const receipt = await decisions.supersede(old, { new_content: 'legacy replacement', reason: 'legacy' });
    expect(receipt.status).toBe('superseded');
    expect((await decisions.get(old, { asOf: new Date().toISOString() })).status).toBe('superseded');
    expect((await decisions.get(receipt.new_decision_id)).status).toBe('active');
  });
});
