export class AuthAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async signup({ email, password, fullName, tier = 'free' }) {
    return this.api.post('/auth/signup', {
      email,
      password,
      full_name: fullName,
      subscription_tier: tier
    });
  }

  async getCurrentUser() {
    return this.api.get('/auth/me');
  }

  async requestPasswordReset(email) {
    return this.api.post('/auth/password-reset/request', { email });
  }

  async resetPassword(token, newPassword) {
    return this.api.post('/auth/password-reset/confirm', {
      token,
      new_password: newPassword
    });
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
