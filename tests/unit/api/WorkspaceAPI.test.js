import { describe, it, expect, vi } from 'vitest';
import { WorkspaceAPI } from '../../../src/api/WorkspaceAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
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

  it('lists workspaces shared with a team', async () => {
    const api = mockBaseAPI();
    const workspaces = new WorkspaceAPI(api);

    await workspaces.listTeamWorkspaces('team/1');

    expect(api.get).toHaveBeenCalledWith('/memory/teams/team%2F1/workspaces');
  });
});
