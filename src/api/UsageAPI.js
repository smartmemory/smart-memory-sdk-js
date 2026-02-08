export class UsageAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async getDashboard() {
    return this.api.get('/usage/dashboard');
  }

  async getCurrent() {
    return this.api.get('/usage/current');
  }

  async getTiers() {
    return this.api.get('/usage/tiers');
  }
}
