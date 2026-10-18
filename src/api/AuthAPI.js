export class AuthAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Current session identity (`GET /auth/me`), passed through unchanged.
   *
   * @returns {Promise<{
   *   id: string,
   *   email: string,
   *   full_name: string | null,
   *   tenant_id: string,
   *   tenant_name?: string | null,
   *   tenant_role: 'owner' | 'admin' | 'member' | null,
   *   subscription_tier: string,
   *   default_workspace_id: string | null,
   *   active_workspace_id: string | null
   * }>} `tenant_name` is the display name of the active tenant (`tenant_id`), `null` when the
   *   tenant is unnamed, and absent when the server predates the field.
   */
  async getCurrentUser() {
    return this.api.get('/auth/me');
  }

  async createAPIKey(name, scopes, expiresInDays = null) {
    return this.api.post('/memory/api-keys', {
      name,
      scopes,
      expires_in_days: expiresInDays
    });
  }

  async listAPIKeys() {
    return this.api.get('/memory/api-keys');
  }

  async revokeAPIKey(keyId) {
    return this.api.delete(`/memory/api-keys/${keyId}`);
  }
}
