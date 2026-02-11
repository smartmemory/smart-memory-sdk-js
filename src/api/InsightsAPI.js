export class InsightsAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async getHealth() {
    return this.api.get('/memory/health');
  }

  async getReflection() {
    return this.api.get('/memory/reflect');
  }

  async getMaintenanceStatus() {
    return this.api.get('/memory/maintenance/status');
  }

  async getPlugins() {
    return this.api.get('/memory/plugins');
  }
}
