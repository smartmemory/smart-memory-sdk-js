import { AuthCore } from '../auth/AuthCore.js';
import { BaseAPI } from './BaseAPI.js';
import { MemoryAPI } from './MemoryAPI.js';
import { DecisionAPI } from './DecisionAPI.js';
import { OpinionAPI } from './OpinionAPI.js';
import { GraphAPI } from './GraphAPI.js';
import { TeamAPI } from './TeamAPI.js';
import { WorkspaceAPI } from './WorkspaceAPI.js';
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
import { LockAPI } from './LockAPI.js';
import { SequenceAPI } from './SequenceAPI.js';
import { RecallAPI } from './RecallAPI.js';
import { PolicyAPI } from './PolicyAPI.js';

/**
 * Main entry point for SmartMemory SDK.
 * Aggregates auth + all domain APIs.
 */
export class SmartMemoryClient {
  constructor(config) {
    this.auth = new AuthCore(config);
    this.connection = this.auth.connection;
    const baseAPI = new BaseAPI(this.auth, { fetchFn: config.fetchFn });
    this._api = baseAPI;

    this.memories = new MemoryAPI(baseAPI);
    this.decisions = new DecisionAPI(baseAPI);
    this.opinions = new OpinionAPI(baseAPI);
    this.graph = new GraphAPI(baseAPI);
    this.teams = new TeamAPI(baseAPI);
    this.workspaces = new WorkspaceAPI(baseAPI);
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
    this.locks = new LockAPI(baseAPI);
    this.sequences = new SequenceAPI(baseAPI);
    this.recall = new RecallAPI(baseAPI);
    this.policy = new PolicyAPI(baseAPI);
  }

  setWorkspaceId(workspaceId) {
    this.auth.tokenManager.setWorkspaceId(workspaceId);
    this.auth.notifyListeners();
  }

  getWorkspaceId() {
    return this.auth.tokenManager.getWorkspaceId();
  }

  setTeamId(teamId) {
    return this.setWorkspaceId(teamId);
  }

  getTeamId() {
    return this.getWorkspaceId();
  }

  /**
   * Export the current workspace as a gzipped OKF bundle.
   * @returns {Promise<ArrayBuffer>}
   */
  async exportOkf() {
    return this._api.requestBinary('/memory/okf/export', { method: 'GET' });
  }

  /**
   * Import a gzipped OKF bundle into the current workspace.
   * @param {Blob | ArrayBuffer | Uint8Array} archive
   * @returns {Promise<{ imported: number, failed: number, workspace_id: string }>}
   */
  async importOkf(archive) {
    const bundle = archive instanceof Blob
      ? archive
      : new Blob([archive], { type: 'application/gzip' });
    const formData = new FormData();
    formData.append('file', bundle, 'smartmemory-okf-import.tar.gz');
    return this._api.postForm('/memory/okf/import', formData);
  }
}
