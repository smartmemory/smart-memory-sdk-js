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

  /**
   * Update the user's LLM provider API keys. Keys are passed through to
   * PATCH /auth/llm-keys; supply only the providers you want to set.
   * @param {Object} keys - any of: openai_key, anthropic_key, groq_key, gemini_key
   */
  async updateLLMKeys(keys) {
    return this.api.patch('/auth/llm-keys', keys);
  }
}
