export class InsightsAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async getHealth() {
    return this.api.get('/insights/health');
  }

  async getReflection() {
    return this.api.get('/insights/reflect');
  }

  async getMaintenanceStatus() {
    return this.api.get('/insights/maintenance/status');
  }

  async getPlugins() {
    return this.api.get('/insights/plugins');
  }
}
