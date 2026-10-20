/**
 * The banner to show now. `nudge` is `null` for every ineligible caller, the server's kill switch
 * and every server-side failure (a 200, never an error), so render nothing when it is `null`.
 * @typedef {Object} UpgradeNudge
 * @property {string} nudge_key - A registry key whose kind is banner.
 * @property {'banner'} kind
 * @property {'web'} surface
 * @property {'team'|'enterprise'} target_tier
 * @property {'billing_manager'} audience
 * @property {string} anchor - `cap-<capability_key>`: link "Compare plans" to `/pricing#<anchor>`.
 * @property {string} copy - Render exactly as returned. The count, if any, is already inside the string.
 * @property {{compare: string, dismiss: string}} actions - Button labels.
 */

function recordPath(nudgeKey, event) {
  if (typeof nudgeKey !== 'string' || nudgeKey === '') {
    throw new TypeError('nudgeKey must be a non-empty string');
  }
  return `/upgrade-nudges/${encodeURIComponent(nudgeKey)}/${event}`;
}

/**
 * Upgrade-nudge banners (`/upgrade-nudges/*`, contract `smart-memory-docs/docs/features/UPGRADE-NUDGES-1/
 * upgrade-nudges-contract.json`, section `endpoint`).
 *
 * The server decides the audience, the caps and the copy from the signed-in principal. This client sends
 * what it is given and returns the body untouched. The state belongs to the user, not to a workspace.
 *
 * Errors are `APIError`s: 404 `unknown_nudge_key` (the key is not a registry banner key) and 422
 * `validation_error` (`surface` missing or not `'web'`). Every method takes an optional `signal`
 * (an `AbortSignal`); an aborted call rejects with the standard `AbortError`.
 */
export class UpgradeNudgeAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * `GET /upgrade-nudges/next?surface=`. Writes nothing.
   * @param {{surface?: 'web', signal?: AbortSignal}} [options] `surface` defaults to `'web'`, the only value the server accepts.
   * @returns {Promise<{nudge: UpgradeNudge|null}>}
   */
  async next({ surface = 'web', signal } = {}) {
    return this.api.get(`/upgrade-nudges/next?surface=${encodeURIComponent(surface)}`, { signal });
  }

  /**
   * The banner was rendered (`POST /upgrade-nudges/{nudge_key}/shown`). Resolves to `{ recorded }`:
   * `false` for an ineligible caller or the kill switch off, not an error.
   * @returns {Promise<{recorded: boolean}>}
   */
  async shown(nudgeKey, { signal } = {}) {
    return this.api.post(recordPath(nudgeKey, 'shown'), undefined, { signal });
  }

  /**
   * "Compare plans" was clicked (`POST /upgrade-nudges/{nudge_key}/clicked`). Resolves to `{ recorded }`.
   * @returns {Promise<{recorded: boolean}>}
   */
  async clicked(nudgeKey, { signal } = {}) {
    return this.api.post(recordPath(nudgeKey, 'clicked'), undefined, { signal });
  }

  /**
   * "Not now" was clicked (`POST /upgrade-nudges/{nudge_key}/dismissed`). Resolves to `{ recorded }`.
   * @returns {Promise<{recorded: boolean}>}
   */
  async dismissed(nudgeKey, { signal } = {}) {
    return this.api.post(recordPath(nudgeKey, 'dismissed'), undefined, { signal });
  }
}
