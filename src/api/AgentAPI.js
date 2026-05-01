export class AgentAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list() {
    return this.api.get('/memory/agents');
  }

  async create({ name, description = null, agentConfig = {}, roles = ['user'] }) {
    return this.api.post('/memory/agents', {
      name,
      description,
      agent_config: agentConfig,
      roles
    });
  }

  async get(agentId) {
    return this.api.get(`/memory/agents/${agentId}`);
  }

  async delete(agentId) {
    return this.api.delete(`/memory/agents/${agentId}`);
  }

  async getRecallProfile(agentId) {
    return this.api.get(`/memory/agents/${agentId}/recall-profile`);
  }

  async setRecallProfile(agentId, recallProfile) {
    return this.api.put(`/memory/agents/${agentId}/recall-profile`, { recall_profile: recallProfile });
  }
}
