// A1 fixtures pinned from smart-memory-graph fcd8284: contracts/decision-effects.json
// and the serialized email.decisionEffects from tests/fixtures/decisionEffects.js.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { expect, it, vi } from 'vitest';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { APIError } from '../../../src/errors/APIError.js';
import schema from '../../fixtures/decisionEffects/schema.json';
import preview from '../../fixtures/decisionEffects/preview.json';

const validator = new Ajv2020();
addFormats(validator);
validator.addSchema(schema, 'a1');

function checkSchema(name, payload) {
  const validate = validator.getSchema(`a1#/$defs/${name}`);
  expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
}

function transport(status, reply, headers = {}) {
  const auth = {
    apiBaseUrl: 'https://sdk.invalid',
    getAuthHeaders: (extra = {}) => ({ ...extra, 'X-Workspace-Id': 'a5j-test' }),
    getRequestOptions: options => options,
  };
  const fetchFn = vi.fn(async () => Response.json(reply, { status, headers }));
  return { fetchFn, decisions: new DecisionAPI(new BaseAPI(auth, { fetchFn })) };
}

const resolutions = {
  east: { choice: 'replace' },
  west: { choice: 'keep_both_scoped', scope: 'marketing email' },
  legal: { choice: 'cancel' },
};

it.each([
  ['standing', d => d.getDecisionEffects('dep #'), 'GET', 'dep%20%23/effects', undefined],
  ['standing by date', d => d.getDecisionEffects('dep #', { as_of: '2025-12-15', show_retired: false }),
    'GET', 'dep%20%23/effects?as_of=2025-12-15&show_retired=false', undefined],
  ['standing with retired', d => d.getDecisionEffects('dep #', { show_retired: true }),
    'GET', 'dep%20%23/effects?show_retired=true', undefined],
  ['preview', d => d.previewDecisionEffects('draft'), 'POST', 'effects/preview', { text: 'draft' }, 'PreviewRequest'],
  ['dated preview', d => d.previewDecisionEffects('draft', { asOf: '2026-11-24' }), 'POST', 'effects/preview',
    { text: 'draft', as_of: '2026-11-24' }, 'PreviewRequest'],
  ['commit', d => d.commitDecisionEffects('draft', resolutions), 'POST', 'effects/commit',
    { text: 'draft', resolutions }, 'CommitRequest'],
  ['add', d => d.addDecisionDependsOn('dep #', 'search'), 'POST', 'dep%20%23/depends-on',
    { target_id: 'search' }, 'DependsOnRequest'],
  ['confirm', d => d.confirmDecisionDependsOn('dep #', 'to ?'), 'POST', 'dep%20%23/depends-on/to%20%3F/confirm', undefined],
  ['remove', d => d.removeDecisionDependsOn('dep #', 'to ?'), 'DELETE', 'dep%20%23/depends-on/to%20%3F', undefined],
])('%s sends the contracted request', async (_name, invoke, method, path, body, definition) => {
  const { decisions, fetchFn } = transport(200, { status: 'cancelled' });
  await invoke(decisions);
  expect(fetchFn).toHaveBeenCalledTimes(1);
  const [[url, options]] = fetchFn.mock.calls;
  expect(url).toBe('https://sdk.invalid/memory/decisions/' + path);
  expect(options.method).toBe(method);
  expect(options.headers['X-Workspace-Id']).toBe('a5j-test');
  const actual = options.body === undefined ? undefined : JSON.parse(options.body);
  expect(actual).toEqual(body);
  if (definition) checkSchema(definition, actual);
});

it('returns the recorded preview including ordered paths, review hops and counts', async () => {
  const { decisions } = transport(200, preview);
  const result = await decisions.previewDecisionEffects('Move email to the US vendor to cut cost');
  checkSchema('DecisionEffectsSnapshot', result);
  expect(result).toEqual(preview);
});

it('preserves suggested edges, affected nodes and the workspace setting', async () => {
  const snapshot = { ...preview, suggestedLinks: 'dashed', suggestions: [],
    data: { nodes: preview.data.nodes.map(n => ({ ...n, viaSuggested: true })),
      edges: preview.data.edges.map(e => ({ ...e, suggested: true })) } };
  const { decisions } = transport(200, snapshot);
  expect(await decisions.getDecisionEffects('vendor')).toEqual(snapshot);
});

it('exposes the unsettled ids on a typed 409', async () => {
  const body = { conflict_ids: ['eu'] };
  checkSchema('UnsettledConflict', body);
  const { decisions } = transport(409, body);
  const error = await decisions.commitDecisionEffects('draft', {}).catch(e => e);
  expect(error).toBeInstanceOf(APIError);
  expect(error).toMatchObject({ status: 409, detail: body });
});

it('preserves the typed budget refusal and Retry-After', async () => {
  const body = { detail: { code: 'budget_exhausted', message: 'Budget exhausted' } };
  const { decisions } = transport(429, body, { 'Retry-After': '5' });
  const error = await decisions.previewDecisionEffects('draft').catch(e => e);
  expect(error).toBeInstanceOf(APIError);
  expect(error).toMatchObject({ status: 429, code: body.detail.code, detail: body, retryAfterMs: 5000 });
});

it('refuses invalid ids before fetch for either end of the link', async () => {
  const { decisions, fetchFn } = transport(200, {});
  await expect(decisions.getDecisionEffects('effects')).rejects.toThrow(/Invalid id/);
  await expect(decisions.addDecisionDependsOn('../effects', 't')).rejects.toThrow(/Invalid id/);
  await expect(decisions.confirmDecisionDependsOn('d', '..')).rejects.toThrow(/Invalid id/);
  await expect(decisions.removeDecisionDependsOn('d', 't/confirm')).rejects.toThrow(/Invalid id/);
  expect(fetchFn).not.toHaveBeenCalled();
});
