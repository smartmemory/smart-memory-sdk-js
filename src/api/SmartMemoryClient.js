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
import { VectorAPI } from './VectorAPI.js';
import { UpgradeNudgeAPI } from './UpgradeNudgeAPI.js';

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
    this.vector = new VectorAPI(baseAPI);
    this.upgradeNudges = new UpgradeNudgeAPI(baseAPI);
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
   * Needs workspace admin or tenant admin: any other caller gets a 403.
   * @param {Object} [options]
   * @param {boolean} [options.vectors=true] Add each item's stored vector so an import with the same embedder skips
   *   re-embedding (BUG-OKF-IMPORT-SLOW-1); false gives a smaller file.
   * @returns {Promise<ArrayBuffer>}
   */
  async exportOkf({ vectors } = {}) {
    const query = vectors === undefined ? '' : `?vectors=${vectors ? 'true' : 'false'}`;
    return this._api.requestBinary(`/memory/okf/export${query}`, { method: 'GET' });
  }

  /**
   * Import a gzipped OKF bundle into the current workspace.
   * @param {Blob | ArrayBuffer | Uint8Array} archive
   * The import merges into what is already in the workspace (BUG-EXPORT-CLEAR-IMPORT-DUPLICATE-DECISIONS-1):
   * `created` items were written, `merged` matched an existing item and were left as they are, `links_added` counts
   * links written, `replacements_restored` replaced decisions put back as replaced, `replacements_not_restored`
   * pairs it could not restore (named in `warnings`). `imported` = `created` + `merged`.
   * When the file carries vectors (BUG-OKF-IMPORT-SLOW-1), `vectors_in_file`, `vectors_reused`, `vectors_refused`
   * (reason to count) and `vectors_sampled` say how many were reused instead of embedded again.
   * @param {Object} [options]
   * @param {boolean} [options.background=false] Answer at once with `{ run_id, status, total, deadline_at }` (HTTP
   *   202) and write in the background; read progress and the result with `okfImportJob(run_id)`.
   * @returns {Promise<{ imported: number, failed: number, workspace_id: string, created: number, merged: number,
   *   links_added: number, replacements_restored: number, replacements_not_restored: number, warnings: string[],
   *   vectors_in_file?: number, vectors_reused?: number, vectors_refused?: Object<string, number>,
   *   vectors_sampled?: number } | { run_id: string, status: string, total: number, deadline_at: number }>}
   */
  async importOkf(archive, { background = false } = {}) {
    const bundle = archive instanceof Blob
      ? archive
      : new Blob([archive], { type: 'application/gzip' });
    const formData = new FormData();
    formData.append('file', bundle, 'smartmemory-okf-import.tar.gz');
    return this._api.postForm(`/memory/okf/import${background ? '?background=true' : ''}`, formData);
  }

  /**
   * Progress and result of a background import (BUG-OKF-IMPORT-SLOW-1).
   * `status` is `queued`, `running`, `completed`, `failed`, `abandoned` (the server lost the run: importing the same
   * file again finishes it) or `unknown_run_id`; `done` of `total` items are settled; `result` is the import's answer
   * once completed.
   * @param {string} runId
   * @returns {Promise<{ run_id: string, status: string, done?: number, total?: number, deadline_at?: number,
   *   error?: string, result?: Object }>}
   */
  async okfImportJob(runId) {
    return this._api.get(`/memory/okf/jobs/${encodeURIComponent(runId)}`);
  }
}
