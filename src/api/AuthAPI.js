export class AuthAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

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
