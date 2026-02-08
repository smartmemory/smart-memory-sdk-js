import { AuthCore } from '../auth/AuthCore.js';
import { BaseAPI } from './BaseAPI.js';
import { MemoryAPI } from './MemoryAPI.js';
import { DecisionAPI } from './DecisionAPI.js';
import { GraphAPI } from './GraphAPI.js';
import { TeamAPI } from './TeamAPI.js';
import { ProfileAPI } from './ProfileAPI.js';
import { SubscriptionAPI } from './SubscriptionAPI.js';
import { AuthAPI } from './AuthAPI.js';
import { AgentAPI } from './AgentAPI.js';
import { UsageAPI } from './UsageAPI.js';
import { InsightsAPI } from './InsightsAPI.js';

/**
 * Main entry point for SmartMemory SDK.
 * Aggregates auth + all domain APIs.
 */
export class SmartMemoryClient {
  constructor(config) {
    this.auth = new AuthCore(config);
    const baseAPI = new BaseAPI(this.auth);

    this.memories = new MemoryAPI(baseAPI);
    this.decisions = new DecisionAPI(baseAPI);
    this.graph = new GraphAPI(baseAPI);
    this.teams = new TeamAPI(baseAPI);
    this.profiles = new ProfileAPI(baseAPI);
    this.subscriptions = new SubscriptionAPI(baseAPI);
    this.authAPI = new AuthAPI(baseAPI);
    this.agents = new AgentAPI(baseAPI);
    this.usage = new UsageAPI(baseAPI);
    this.insights = new InsightsAPI(baseAPI);
  }
}
