const LIFECYCLE_CAPABILITY = 'lifecycle.v1';
const LIFECYCLE_UNSUPPORTED = () => ({ supported: false });
const SUPERSESSION_POLICIES = ['retire', 'propose', null];

export class WorkspaceAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * List the workspaces visible in the active tenant. `includeHidden: true` adds the hidden workspaces still inside
   * their restore window that the caller may restore (`?include=hidden`). The response carries `capabilities`
   * (`["lifecycle.v1"]` when the API serves the lifecycle routes); every list response refreshes the lifecycle
   * capability this instance remembers (see `_lifecycleSupported`).
   */
  async list({ includeHidden = false } = {}) {
    const result = await this.api.get(
      includeHidden ? '/memory/workspaces?include=hidden' : '/memory/workspaces'
    );
    this._lifecycle = Array.isArray(result?.capabilities) && result.capabilities.includes(LIFECYCLE_CAPABILITY);
    return result;
  }

  /**
   * Whether the API serves the lifecycle routes. Answered from the last list response of this instance; when none
   * has been fetched yet, fetches the list once (one GET) and remembers the answer. The answer lives for the life
   * of the instance and is refreshed by every `list()`. A failed capability fetch is not cached and rejects.
   * @private
   */
  async _lifecycleSupported() {
    if (this._lifecycle === undefined) {
      this._lifecycleProbe ??= this.list().finally(() => { this._lifecycleProbe = null; });
      await this._lifecycleProbe;
    }
    return this._lifecycle === true;
  }

  /**
   * Lifecycle methods below resolve to `{ supported: false }` and issue no request when the API does not advertise
   * `lifecycle.v1`. Otherwise they resolve to the route's body and reject with an `APIError` on 403 (neutral: not
   * permitted, missing or another tenant's), 404, 409 (refused from this state, or a lost race) and 503.
   */
  async get(workspaceId) {
    if (!(await this._lifecycleSupported())) return LIFECYCLE_UNSUPPORTED();
    return this.api.get(`/memory/workspaces/${encodeURIComponent(workspaceId)}`);
  }

  /** Rename and/or change the description; only the fields passed are sent. Neither passed rejects with a TypeError, no request. */
  async update(workspaceId, { name, description } = {}) {
    const body = {};
    if (name !== undefined) body.name = name;
    if (description !== undefined) body.description = description;
    if (Object.keys(body).length === 0) {
      throw new TypeError('workspaces.update needs name and/or description');
    }
    if (!(await this._lifecycleSupported())) return LIFECYCLE_UNSUPPORTED();
    return this.api.patch(`/memory/workspaces/${encodeURIComponent(workspaceId)}`, body);
  }

  /**
   * Hide a workspace. Resolves to `{ workspace_id, state: 'hidden', restore_until }` (202).
   * A team admin can restore it until `restore_until` (30 days). After that its content is erased for good.
   * Its billing records (credit ledger and usage-limit counters) are kept 7 years for accounting, marked deleted and never shown.
   */
  async delete(workspaceId) {
    if (!(await this._lifecycleSupported())) return LIFECYCLE_UNSUPPORTED();
    return this.api.delete(`/memory/workspaces/${encodeURIComponent(workspaceId)}`);
  }

  /** Restore a hidden workspace inside its restore window. Resolves to the workspace detail (200). */
  async restore(workspaceId) {
    if (!(await this._lifecycleSupported())) return LIFECYCLE_UNSUPPORTED();
    return this.api.post(`/memory/workspaces/${encodeURIComponent(workspaceId)}/restore`);
  }

  /**
   * Create a workspace. With `teamId` it is shared with that Team (tenant administrators only). Without it, it is the
   * caller's own private workspace with no Team, which nobody else can see (WS-POLICY-10 B): any member may create one
   * with a signed-in session or their own unbound key; agent and workspace-bound keys get a 403. `team_id` is then left
   * out of the body. The new workspace is not made the session default.
   */
  async create({ name, teamId, description = null }) {
    const body = { name, description };
    if (teamId !== undefined && teamId !== null) body.team_id = teamId;
    return this.api.post('/memory/workspaces', body);
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
   * Read the workspace's supersession policy (`review.supersession` on the workspace settings route, WS-MGMT-16).
   * `retire` lets a newer fact retire the older one at once; `propose` files a conflict review instead.
   * Returns `{ workspaceId, policy, source, stated, version }`; pass `version` as `ifMatch` to `setSupersessionPolicy`.
   */
  async getSupersessionPolicy(workspaceId) {
    const settings = await this.api.get(`/memory/workspaces/${encodeURIComponent(workspaceId)}/settings`);
    return supersessionView(workspaceId, settings);
  }

  /**
   * Set the supersession policy: `'retire'`, `'propose'`, or `null` to inherit. Needs the edit grant on the
   * workspace (a viewer gets 403); an API key or agent may only tighten (set `propose`). `ifMatch` sends `If-Match`
   * (a stale version is a 409).
   */
  async setSupersessionPolicy(workspaceId, policy, { ifMatch } = {}) {
    if (!SUPERSESSION_POLICIES.includes(policy)) {
      throw new TypeError("policy must be 'retire', 'propose' or null");
    }
    const options = ifMatch === undefined || ifMatch === null ? {} : { headers: { 'If-Match': String(ifMatch) } };
    const settings = await this.api.patch(
      `/memory/workspaces/${encodeURIComponent(workspaceId)}/settings`,
      { stated: { review: { supersession: policy } } },
      options
    );
    return supersessionView(workspaceId, settings);
  }
}

function supersessionView(workspaceId, settings) {
  return {
    workspaceId: settings?.scope_id ?? workspaceId,
    policy: settings?.effective?.review?.supersession ?? null,
    source: settings?.source?.review?.supersession ?? null,
    stated: settings?.stated?.review?.supersession ?? null,
    version: settings?.version ?? null
  };
}
