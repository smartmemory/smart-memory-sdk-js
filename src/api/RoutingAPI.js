import { APIError } from '../errors/APIError.js';
import { RoutingPrefsConflictError, routingErrorCode } from '../errors/RoutingErrors.js';

/**
 * @typedef {'call'|'bound_key'|'session'|'context'|'client_default'|'account_default'|'rule'|'migration'|'sync'|'system'} RoutedBy
 * @typedef {{code: string, lever: string, detail: string}} RoutingNotice
 * @typedef {{
 *   workspace_id: string|null, workspace_name: string|null, routed_by: RoutedBy|null,
 *   notices: RoutingNotice[]
 * }} RoutingEcho Where a write landed. Absent on an older server, which reads as null / [].
 * @typedef {{account_default_workspace_id: string|null, version: number, updated_at: string|null}} RoutingPrefs
 * @typedef {{lever: string, workspace_id?: string|null, status: string, workspace_name?: string|null}} RoutingCandidate
 * @typedef {{
 *   user_id: string, workspace_id: string|null, workspace_name: string|null,
 *   routed_by: RoutedBy|null, routed_by_ref?: string|null, notices: RoutingNotice[],
 *   refusal: string|null, candidates: RoutingCandidate[],
 *   flags: {personal_floor: boolean, cookie_display_only: boolean}
 * }} RoutingExplain
 */

/**
 * Read the write echo (`workspace_id`, `workspace_name`, `routed_by`, `notices`) off a
 * `memories.create` / `memories.ingest` / `memories.ingestConversation` result. Missing
 * keys (an older server), a non-object body and a non-array `notices` read as
 * `null` / `[]`, never an error. `routed_by_ref` is never echoed.
 * @param {unknown} result
 * @returns {RoutingEcho}
 */
export function routingEcho(result) {
  const data = result && typeof result === 'object' ? result : {};
  return {
    workspace_id: data.workspace_id ?? null,
    workspace_name: data.workspace_name ?? null,
    routed_by: data.routed_by ?? null,
    notices: Array.isArray(data.notices) ? [...data.notices] : []
  };
}

/**
 * Workspace routing prefs and explain (WS-ROUTING-2b). User-scoped routes: no workspace
 * header is needed, and an explicit workspace the caller cannot use gets the usual 403.
 */
export class RoutingAPI {
  /** @param {import('./BaseAPI.js').BaseAPI} api */
  constructor(api) {
    this.api = api;
  }

  /**
   * `GET /memory/routing/prefs`. No stored row reads
   * `{account_default_workspace_id: null, version: 0, updated_at: null}`.
   * @returns {Promise<RoutingPrefs>}
   */
  async getPrefs() {
    return this._call(() => this.api.get('/memory/routing/prefs'));
  }

  /**
   * `PUT /memory/routing/prefs`: set (or clear, with `null`) the account default workspace.
   * Compare-and-set: `version` is the value last read from `getPrefs()` (0 for no row).
   *
   * Rejects with `RoutingPrefsConflictError` (409 `routing_prefs_version_conflict`) on a
   * lost CAS. Every other 403/409/422 stays a plain `APIError` with `errorCode` set to the
   * server code (`routing_prefs_human_only`, `client_bound_to_workspace`,
   * `insufficient_team_permissions`) or `null`.
   * @param {string|null} accountDefaultWorkspaceId
   * @param {number} version
   * @returns {Promise<RoutingPrefs>}
   */
  async setPrefs(accountDefaultWorkspaceId, version) {
    if (!Number.isInteger(version) || version < 0) {
      throw new TypeError('setRoutingPrefs version must be an integer >= 0 (the value last read)');
    }
    return this._call(() => this.api.put('/memory/routing/prefs', {
      account_default_workspace_id: accountDefaultWorkspaceId,
      version
    }));
  }

  /**
   * `GET /memory/routing/explain`: where a write would land, and why. Writes nothing.
   * Only the options you pass go on the query (each max 200 chars).
   * @param {{clientKey?: string|null, contextKey?: string|null, fileWorkspaceId?: string|null}} [options]
   *   `clientKey` stands in for `X-SM-Client`; `fileWorkspaceId` is what an accepted file would pick.
   * @returns {Promise<RoutingExplain>}
   */
  async explain({ clientKey = null, contextKey = null, fileWorkspaceId = null } = {}) {
    const query = new URLSearchParams();
    if (clientKey !== null && clientKey !== undefined) query.set('client_key', clientKey);
    if (contextKey !== null && contextKey !== undefined) query.set('context_key', contextKey);
    if (fileWorkspaceId !== null && fileWorkspaceId !== undefined) {
      query.set('file_workspace_id', fileWorkspaceId);
    }
    const qs = query.toString();
    return this._call(() => this.api.get(`/memory/routing/explain${qs ? `?${qs}` : ''}`));
  }

  /** @private Stamp `errorCode` on an `APIError`; a lost CAS becomes `RoutingPrefsConflictError`. */
  async _call(fn) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof APIError)) throw error;
      const code = routingErrorCode(error.detail);
      if (error.status === 409 && code === 'routing_prefs_version_conflict') {
        throw new RoutingPrefsConflictError(code, error.status, error.detail);
      }
      error.errorCode = code;
      throw error;
    }
  }
}
