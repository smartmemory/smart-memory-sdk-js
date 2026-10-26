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

  /**
   * Select a workspace for one client (and context) (WS-ROUTING-4, `PUT /memory/routing/session`). A write that
   * names no workspace and sends `X-SM-Client: <clientKey>` (and `X-SM-Context` for a context pick) lands there until
   * the pick goes idle (service default 24 h). Resolves to the record: `{ workspace_id, client_key_digest,
   * context_key_digest, set_at, set_via, expires_at, client_key, context_key, workspace_name }`. The service answers
   * 403 for a workspace the caller cannot use (same whether or not it exists), 409 for a workspace-bound API key and
   * 422 for a key outside the contract grammar.
   */
  async setSessionWorkspace(workspaceId, { clientKey, contextKey = null }) {
    const body = { workspace_id: workspaceId, client_key: clientKey };
    if (contextKey !== null && contextKey !== undefined) body.context_key = contextKey;
    return this.api.put('/memory/routing/session', body);
  }

  /**
   * Clear the caller's own pick for one client (and context) (`DELETE /memory/routing/session`). Resolves to
   * `{ deleted, client_key, context_key }`; clearing nothing is not an error.
   */
  async clearSessionWorkspace({ clientKey, contextKey = null }) {
    const params = new URLSearchParams({ client_key: clientKey });
    if (contextKey !== null && contextKey !== undefined) params.set('context_key', contextKey);
    return this.api.delete(`/memory/routing/session?${params.toString()}`);
  }
}
