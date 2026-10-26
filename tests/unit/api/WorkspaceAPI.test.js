import { describe, it, expect, vi } from 'vitest';
import { WorkspaceAPI } from '../../../src/api/WorkspaceAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
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
  // WS-ROUTING-4: one row per call shape. Columns: name, call, verb, expected arguments.
  const SESSION_ROWS = [
    [
      'sets a session pick without a context',
      (w) => w.setSessionWorkspace('ws-1', { clientKey: 'app:web' }),
      'put',
      ['/memory/routing/session', { workspace_id: 'ws-1', client_key: 'app:web' }]
    ],
    [
      'sets a session pick with a context',
      (w) => w.setSessionWorkspace('ws-1', { clientKey: 'app:web', contextKey: 'repo:aaaaaaaaaaaa' }),
      'put',
      ['/memory/routing/session', { workspace_id: 'ws-1', client_key: 'app:web', context_key: 'repo:aaaaaaaaaaaa' }]
    ],
    [
      'clears a session pick with the key as a query, no trailing slash',
      (w) => w.clearSessionWorkspace({ clientKey: 'mcp:claude-ai' }),
      'delete',
      ['/memory/routing/session?client_key=mcp%3Aclaude-ai']
    ],
    [
      'clears a context pick',
      (w) => w.clearSessionWorkspace({ clientKey: 'app:web', contextKey: 'repo:aaaaaaaaaaaa' }),
      'delete',
      ['/memory/routing/session?client_key=app%3Aweb&context_key=repo%3Aaaaaaaaaaaaa']
    ]
  ];

  it.each(SESSION_ROWS)('%s', async (_name, call, verb, args) => {
    const api = mockBaseAPI();
    await call(new WorkspaceAPI(api));
    expect(api[verb]).toHaveBeenCalledWith(...args);
  });

  it('passes a service refusal through unchanged', async () => {
    const api = mockBaseAPI();
    const refusal = Object.assign(new Error('insufficient_team_permissions'), { status: 403 });
    api.put.mockRejectedValue(refusal);
    await expect(new WorkspaceAPI(api).setSessionWorkspace('ws-x', { clientKey: 'app:web' })).rejects.toBe(refusal);
  });
});
