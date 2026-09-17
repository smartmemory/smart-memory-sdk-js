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

  async listTeamWorkspaces(teamId) {
    return this.api.get(`/memory/teams/${encodeURIComponent(teamId)}/workspaces`);
  }
}
