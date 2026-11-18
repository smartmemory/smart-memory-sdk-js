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

  /**
   * Set or clear another member's read-only flag. A read-only member keeps the `member` role and can
   * read, but every write is refused with 403. Only an organization admin (or a superadmin) signed in
   * with a session may call this, never with an API key and never on their own membership; an admin
   * target is 409. Team, member list and permissions responses report the flag as `read_only`.
   */
  async setMemberReadOnly(teamId, userId, readOnly) {
    return this.api.put(`/memory/teams/${teamId}/members/${userId}/read-only`, { read_only: readOnly });
  }
}
