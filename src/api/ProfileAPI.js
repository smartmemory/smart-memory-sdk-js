export class ProfileAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list() {
    return this.api.get('/memory/pipeline/profiles');
  }

  async get(name) {
    return this.api.get(`/memory/pipeline/profiles/${name}`);
  }

  async getLLMKeys() {
    return this.api.get('/auth/llm-keys');
  }

  async updateLLMKeys(keys) {
    return this.api.put('/auth/llm-keys', keys);
  }
}
