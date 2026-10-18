export class WorkspaceAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list() {
    return this.api.get('/memory/workspaces');
  }

  async create({ name, teamId, description = null }) {
    return this.api.post('/memory/workspaces', {
      name,
      description,
      team_id: teamId
    });
  }

  async share(workspaceId, { teamId, permission }) {
    return this.api.post(`/memory/workspaces/${encodeURIComponent(workspaceId)}/share`, {
      team_id: teamId,
      permission
    });
  }

  async revoke(workspaceId, teamId) {
    return this.api.delete(
      `/memory/workspaces/${encodeURIComponent(workspaceId)}/share/${encodeURIComponent(teamId)}`
    );
  }

  /**
   * Who can use this workspace (SVC-WORKSPACE-ACCESS-1). Resolves to
   * `{ workspace_id, teams: [{ team_id, name, permission, team_exists }], users: [{ user_id, permission }] }`.
   * A grant whose team was deleted stays listed with `team_exists: false` and `name: null`, so the UI can offer
   * a reassign. Readable by whoever may share or revoke on the workspace (an organization admin or a workspace
   * admin). Rejects with 403 for anyone else in the organization and 404 for an unknown or another organization's
   * workspace id.
   */
  async getAccess(workspaceId) {
    return this.api.get(`/memory/workspaces/${encodeURIComponent(workspaceId)}/access`);
  }

  async listTeamWorkspaces(teamId) {
    return this.api.get(`/memory/teams/${encodeURIComponent(teamId)}/workspaces`);
  }
}
