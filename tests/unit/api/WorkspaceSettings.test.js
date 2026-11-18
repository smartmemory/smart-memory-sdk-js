import { describe, it, expect, vi } from 'vitest';
import { WorkspaceAPI } from '../../../src/api/WorkspaceAPI.js';

// WS-MGMT-16-FU: workspace and tenant settings (contract modules.settings)
const PATCH = { review: { supersession: 'propose' } };
const SETTINGS = {
  scope: 'workspace',
  scope_id: 'ws1',
  version: 4,
  stated: PATCH,
  effective: PATCH,
  source: { review: { supersession: 'workspace' } },
  read_only: {}
};

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue(SETTINGS),
    patch: vi.fn().mockResolvedValue(SETTINGS)
  };
}

// [name, call, verb, path, body]
const ROUTES = [
  ['getWorkspaceSettings', w => w.getWorkspaceSettings('ws 9'), 'get', '/memory/workspaces/ws%209/settings', undefined],
  ['updateWorkspaceSettings', w => w.updateWorkspaceSettings('ws 9', PATCH), 'patch', '/memory/workspaces/ws%209/settings', { stated: PATCH }],
  ['getTenantSettings', w => w.getTenantSettings(), 'get', '/memory/tenant/settings', undefined],
  ['updateTenantSettings', w => w.updateTenantSettings(PATCH), 'patch', '/memory/tenant/settings', { stated: PATCH }]
];

describe('WorkspaceAPI settings', () => {
  it.each(ROUTES)('%s hits its route and returns the record', async (_name, call, verb, path, body) => {
    const api = mockBaseAPI();
    await expect(call(new WorkspaceAPI(api))).resolves.toEqual(SETTINGS);
    const args = api[verb].mock.calls[0];
    expect(args[0]).toBe(path);
    if (body) {
      expect(args[1]).toEqual(body);
      expect(args[2]).toEqual({});
    }
  });

  it('sends If-Match on both patches when given', async () => {
    const api = mockBaseAPI();
    const w = new WorkspaceAPI(api);
    await w.updateWorkspaceSettings('ws1', PATCH, { ifMatch: 4 });
    await w.updateTenantSettings(PATCH, { ifMatch: 0 });
    expect(api.patch.mock.calls[0][2]).toEqual({ headers: { 'If-Match': '4' } });
    expect(api.patch.mock.calls[1][2]).toEqual({ headers: { 'If-Match': '0' } });
  });

  it('sends null to restore inheritance', async () => {
    const api = mockBaseAPI();
    await new WorkspaceAPI(api).updateWorkspaceSettings('ws1', { review: { supersession: null } });
    expect(api.patch.mock.calls[0][1]).toEqual({ stated: { review: { supersession: null } } });
  });

  it.each([403, 409, 503])('passes a %i through on every method', async status => {
    const error = Object.assign(new Error('refused'), { status });
    const api = { get: vi.fn().mockRejectedValue(error), patch: vi.fn().mockRejectedValue(error) };
    const w = new WorkspaceAPI(api);
    for (const call of [
      () => w.getWorkspaceSettings('ws1'),
      () => w.updateWorkspaceSettings('ws1', PATCH, { ifMatch: 1 }),
      () => w.getTenantSettings(),
      () => w.updateTenantSettings(PATCH, { ifMatch: 1 })
    ]) {
      await expect(call()).rejects.toMatchObject({ status });
    }
  });

  it('supersession helpers keep their shape on top of the settings methods', async () => {
    const w = new WorkspaceAPI(mockBaseAPI());
    const view = { workspaceId: 'ws1', policy: 'propose', source: 'workspace', stated: 'propose', version: 4 };
    await expect(w.getSupersessionPolicy('ws1')).resolves.toEqual(view);
    await expect(w.setSupersessionPolicy('ws1', 'propose', { ifMatch: 4 })).resolves.toEqual(view);
  });
});
