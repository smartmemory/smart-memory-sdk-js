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
import { TokenUsageAPI } from './TokenUsageAPI.js';
import { TemporalAPI } from './TemporalAPI.js';
import { GovernanceAPI } from './GovernanceAPI.js';
import { EvolutionAPI } from './EvolutionAPI.js';
import { ReasoningAPI } from './ReasoningAPI.js';
import { ReasoningTracesAPI } from './ReasoningTracesAPI.js';
import { OntologyAPI } from './OntologyAPI.js';
import { AnalyticsAPI } from './AnalyticsAPI.js';
import { ValidationAPI } from './ValidationAPI.js';
import { PipelineAPI } from './PipelineAPI.js';
import { ArchiveAPI } from './ArchiveAPI.js';
import { ZettelkastenAPI } from './ZettelkastenAPI.js';
import { ProcedureMatchAPI } from './ProcedureMatchAPI.js';
import { ProcedureCandidateAPI } from './ProcedureCandidateAPI.js';
import { ProcedureDriftAPI } from './ProcedureDriftAPI.js';
import { SummaryAPI } from './SummaryAPI.js';

/**
 * Main entry point for SmartMemory SDK.
 * Aggregates auth + all domain APIs.
 */
export class SmartMemoryClient {
  constructor(config) {
    this.auth = new AuthCore(config);
    const baseAPI = new BaseAPI(this.auth, { fetchFn: config.fetchFn });

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
    this.tokenUsage = new TokenUsageAPI(baseAPI);
    this.temporal = new TemporalAPI(baseAPI);
    this.governance = new GovernanceAPI(baseAPI);
    this.evolution = new EvolutionAPI(baseAPI);
    this.reasoning = new ReasoningAPI(baseAPI);
    this.reasoningTraces = new ReasoningTracesAPI(baseAPI);
    this.ontology = new OntologyAPI(baseAPI);
    this.analytics = new AnalyticsAPI(baseAPI);
    this.validation = new ValidationAPI(baseAPI);
    this.pipeline = new PipelineAPI(baseAPI);
    this.archive = new ArchiveAPI(baseAPI);
    this.zettelkasten = new ZettelkastenAPI(baseAPI);
    this.procedureMatches = new ProcedureMatchAPI(baseAPI);
    this.procedureCandidates = new ProcedureCandidateAPI(baseAPI);
    this.procedureDrift = new ProcedureDriftAPI(baseAPI);
    this.summaries = new SummaryAPI(baseAPI);
  }

  setTeamId(teamId) {
    this.auth.tokenManager.setTeamId(teamId);
    this.auth.notifyListeners();
  }

  getTeamId() {
    return this.auth.tokenManager.getTeamId();
  }
}
