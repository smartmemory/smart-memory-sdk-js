import { describe, it, expect, vi } from 'vitest';
import { WorkspaceAPI } from '../../../src/api/WorkspaceAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(null)
  };
}

describe('WorkspaceAPI', () => {
  it('lists workspaces', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);

    await workspaces.list();

    expect(api.get).toHaveBeenCalledWith('/memory/workspaces');
  });

  it('creates a workspace with the contract request schema', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);

    await workspaces.create({
      name: 'Research',
      description: 'Research workspace',
      teamId: 'team-1'
    });

    expect(api.post).toHaveBeenCalledWith('/memory/workspaces', {
      name: 'Research',
      description: 'Research workspace',
      team_id: 'team-1'
    });
  });

  it('defaults an omitted workspace description to null', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);

    await workspaces.create({ name: 'Research', teamId: 'team-1' });

    expect(api.post).toHaveBeenCalledWith('/memory/workspaces', {
      name: 'Research',
      description: null,
      team_id: 'team-1'
    });
  });

  it('shares a workspace with the contract request schema', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);

    await workspaces.share('workspace/1', {
      teamId: 'team-2',
      permission: 'view'
    });

    expect(api.post).toHaveBeenCalledWith('/memory/workspaces/workspace%2F1/share', {
      team_id: 'team-2',
      permission: 'view'
    });
  });

  it('revokes a team workspace share', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);

    await workspaces.revoke('workspace/1', 'team/2');

    expect(api.delete).toHaveBeenCalledWith(
      '/memory/workspaces/workspace%2F1/share/team%2F2'
    );
  });

  it('reads a workspace access list and returns the service body', async () => {
    const body = {
      workspace_id: 'workspace/1',
      teams: [
        { team_id: 'team-ops', name: 'Ops', permission: 'admin', team_exists: true },
        { team_id: 'team-gone', name: null, permission: 'view', team_exists: false }
      ],
      users: [{ user_id: 'user-1', permission: 'admin' }]
    };
    const api = mockBaseAPI();
    api.get.mockResolvedValue(body);
    const workspaces = new WorkspaceAPI(api);

    const result = await workspaces.getAccess('workspace/1');

    expect(api.get).toHaveBeenCalledWith('/memory/workspaces/workspace%2F1/access');
    expect(result).toEqual(body);
  });

  it('passes a workspace access refusal through unchanged', async () => {
    const refusal = Object.assign(new Error('forbidden'), { status: 403 });
    const api = mockBaseAPI();
    api.get.mockRejectedValue(refusal);
    const workspaces = new WorkspaceAPI(api);

    await expect(workspaces.getAccess('ws-1')).rejects.toBe(refusal);
  });

  it('lists workspaces shared with a team', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);

    await workspaces.listTeamWorkspaces('team/1');

    expect(api.get).toHaveBeenCalledWith('/memory/teams/team%2F1/workspaces');
  });
});

describe('WorkspaceAPI supersession policy (OUTREACH-MARIUS-HITL-SURFACE-1)', () => {
  const SETTINGS = {
    scope: 'workspace',
    scope_id: 'ws1',
    version: 3,
    stated: { review: { supersession: 'retire' } },
    effective: { review: { supersession: 'retire' } },
    source: { review: { supersession: 'workspace' } },
    read_only: {}
  };

  it('reads the review.supersession knob from the settings route', async () => {
    const api = mockBaseAPI();
    api.get.mockResolvedValueOnce(SETTINGS);
    const workspaces = new WorkspaceAPI(api);
    await expect(workspaces.getSupersessionPolicy('ws 1')).resolves.toEqual({
      workspaceId: 'ws1', policy: 'retire', source: 'workspace', stated: 'retire', version: 3
    });
    expect(api.get).toHaveBeenCalledWith('/memory/workspaces/ws%201/settings');
  });

  it.each(['retire', 'propose', null])('patches the knob to %s with If-Match', async policy => {
    const api = mockBaseAPI();
    api.patch.mockResolvedValueOnce(SETTINGS);
    const workspaces = new WorkspaceAPI(api);
    await workspaces.setSupersessionPolicy('ws9', policy, { ifMatch: 3 });
    expect(api.patch).toHaveBeenCalledWith(
      '/memory/workspaces/ws9/settings',
      { stated: { review: { supersession: policy } } },
      { headers: { 'If-Match': '3' } }
    );
  });

  it('sends no If-Match when none is given', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);
    await workspaces.setSupersessionPolicy('ws9', 'propose');
    expect(api.patch.mock.calls[0][2]).toEqual({});
  });

  it('rejects an unknown policy before any request', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);
    await expect(workspaces.setSupersessionPolicy('ws9', 'delete')).rejects.toThrow(TypeError);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each([403, 404, 409, 400, 500])('passes a %i through', async status => {
    const api = mockBaseAPI();
    const error = Object.assign(new Error('refused'), { status });
    api.get.mockRejectedValueOnce(error);
    api.patch.mockRejectedValueOnce(error);
    const workspaces = new WorkspaceAPI(api);
    await expect(workspaces.getSupersessionPolicy('ws1')).rejects.toMatchObject({ status });
    await expect(workspaces.setSupersessionPolicy('ws1', 'propose')).rejects.toMatchObject({ status });
  });
});
