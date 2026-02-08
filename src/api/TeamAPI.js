export class TeamAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async list() {
    return this.api.get('/memory/teams/');
  }

  async create({ name, description = null, dataClassification = 'internal', costCenter = null }) {
    return this.api.post('/memory/teams/', {
      name,
      description,
      data_classification: dataClassification,
      cost_center: costCenter
    });
  }

  async get(teamId) {
    return this.api.get(`/memory/teams/${teamId}`);
  }

  async update(teamId, updates) {
    return this.api.put(`/memory/teams/${teamId}`, updates);
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
    return this.api.put(`/memory/teams/${teamId}/members/${userId}`, { role });
  }

  async removeMember(teamId, userId) {
    return this.api.delete(`/memory/teams/${teamId}/members/${userId}`);
  }
}
