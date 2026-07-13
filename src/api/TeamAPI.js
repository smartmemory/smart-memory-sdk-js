export class TeamAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list({ includeSystem = false } = {}) {
    const suffix = includeSystem ? '?include_system=true' : '';
    return this.api.get(`/memory/teams${suffix}`);
  }

  async create({ name, description = null, dataClassification = 'internal', costCenter = null, isSystem = false }) {
    const body = {
      name,
      description,
      data_classification: dataClassification,
      cost_center: costCenter
    };
    if (isSystem) body.is_system = true;
    return this.api.post('/memory/teams', body);
  }

  async get(teamId) {
    return this.api.get(`/memory/teams/${teamId}`);
  }

  async update(teamId, updates) {
    return this.api.patch(`/memory/teams/${teamId}`, updates);
  }

  async delete(teamId) {
    return this.api.delete(`/memory/teams/${teamId}`);
  }

  async getMembers(teamId) {
    return this.api.get(`/memory/teams/${teamId}/members`);
  }

  async addMember(teamId, userId, role = 'member') {
    return this.api.post(`/memory/teams/${teamId}/members`, {
      user_id: userId,
      role
    });
  }

  async updateMember(teamId, userId, role) {
    return this.api.patch(`/memory/teams/${teamId}/members/${userId}`, { role });
  }

  async removeMember(teamId, userId) {
    return this.api.delete(`/memory/teams/${teamId}/members/${userId}`);
  }
}
