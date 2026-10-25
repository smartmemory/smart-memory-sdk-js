/**
 * Pipeline API - Pipeline stage execution, state, and config management.
 *
 * Covers all endpoints from pipeline.py:
 *   POST   /memory/pipeline/extraction
 *   POST   /memory/pipeline/storage
 *   POST   /memory/pipeline/linking
 *   POST   /memory/pipeline/enrichment
 *   POST   /memory/pipeline/grounding
 *   GET    /memory/pipeline/{pipeline_id}/state
 *   DELETE /memory/pipeline/{pipeline_id}
 *   DELETE /memory/pipeline/{pipeline_id}/run/{run_id}
 *   GET    /memory/pipeline/configs
 *   POST   /memory/pipeline/configs
 *   GET    /memory/pipeline/configs/{config_name}
 *   PUT    /memory/pipeline/configs/{config_name}
 *   DELETE /memory/pipeline/configs/{config_name}
 *
 * 2.0 (ST33/G169): each stage call resolves to a `stage_job` save receipt (`SaveReceipt`), not the
 * stage output. Await it (`awaitReceipt`), then take the next stage's request from
 * `chainRequest(receipt)`: it carries `result.pipeline_state_run_id`, never `receipt.run_id`.
 */
import { APIError } from '../errors/APIError.js';
import { StageChainError, STAGE_CHAIN_CODES } from '../errors/ReceiptErrors.js';
import { decodeReceipt } from './receipt.js';
import { awaitReceipt } from './awaitReceipt.js';
import { resolveIdempotencyKey, submitWithRetry, mapAdmissionError } from './submit.js';

const MAX_TRACKED_RUNS = 1000;

export class PipelineAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
    // Receipt run_ids this instance has returned: passing one as a stage request's `run_id` is a chain error.
    this._receiptRunIds = new Set();
  }

  /**
   * One public stage submission under one `idempotency_key` (ST14), decoded to a receipt.
   * @private
   */
  async _stage(stage, request) {
    const runId = request?.run_id;
    if (typeof runId === 'string' && this._receiptRunIds.has(runId)) {
      console.warn(`[pipeline] ${stage} refused: run_id ${runId} is a receipt run, not a pipeline_state_run_id`);
      throw new StageChainError(
        'receipt.run_id is the execution handle; pass result.pipeline_state_run_id (use chainRequest)',
        'stage_chain_invalid', { run_id: runId }
      );
    }
    const { idempotencyKey, ...rest } = request ?? {};
    const key = resolveIdempotencyKey(idempotencyKey);
    const body = { ...rest, idempotency_key: key };
    const path = `/memory/pipeline/${stage}`;
    let raw;
    try {
      raw = await submitWithRetry(() => this.api.post(path, body), { idempotencyKey: key });
    } catch (error) {
      throw mapStageError(mapAdmissionError(error));
    }
    const receipt = decodeReceipt(raw);
    if (this._receiptRunIds.size >= MAX_TRACKED_RUNS) this._receiptRunIds.delete(this._receiptRunIds.values().next().value);
    this._receiptRunIds.add(receipt.run_id);
    return receipt;
  }

  /**
   * Wait for a stage receipt to reach terminal fate; on the deadline it resolves pending with
   * `client_timed_out: true`.
   * @param {import('./receipt.js').SaveReceipt} receipt
   * @param {{timeoutMs?: number, holdMs?: number, signal?: AbortSignal}} [options]
   */
  async awaitReceipt(receipt, options = {}) {
    return awaitReceipt(this.api, receipt, options);
  }

  /**
   * Await a stage receipt and build the next stage's request from its authorized result: `request`
   * plus `run_id: result.pipeline_state_run_id`. Rejects with `StageChainError` (`code`
   * `stage_result_pending`, `stage_result_expired`, `stage_result_unavailable` or `stage_chain_invalid`)
   * when the chain cannot proceed. The failed job's own receipt `error` stays on `err.receipt`.
   * @param {import('./receipt.js').SaveReceipt} receipt
   * @param {Object} [request] Other fields of the next stage's request.
   * @param {{timeoutMs?: number, holdMs?: number, signal?: AbortSignal}} [options]
   */
  async chainRequest(receipt, request = {}, options = {}) {
    const done = await this.awaitReceipt(receipt, options);
    const fail = (message, code, retryable = false) => {
      const error = new StageChainError(message, code, { run_id: done.run_id, retryable });
      error.receipt = done;
      console.warn(`[pipeline] chain refused (${code}) for run_id=${done.run_id}: ${message}`);
      return error;
    };
    if (done.subject?.kind !== 'stage_job') throw (fail('receipt is not a stage_job', 'stage_chain_invalid'));
    if (!done.terminal) throw (fail('stage result is still pending', 'stage_result_pending', true));
    if (done.result_availability === 'expired') throw (fail('stage result expired; new deliberate work is required', 'stage_result_expired'));
    const stateRunId = done.result?.pipeline_state_run_id;
    if (done.result_availability !== 'available' || typeof stateRunId !== 'string' || !stateRunId) {
      throw (fail(`stage ended ${done.outcome} with no usable pipeline_state_run_id`, 'stage_result_unavailable'));
    }
    return { ...request, run_id: stateRunId };
  }

  // === STAGE EXECUTION ===

  /**
   * Run extraction pipeline stage. Resolves to a `stage_job` save receipt.
   * @param {Object} request - ExtractionRequest; `idempotencyKey` reuses a persisted key
   * @returns {Promise<import('./receipt.js').SaveReceipt>}
   */
  async runExtraction(request) {
    return this._stage('extraction', request);
  }

  /**
   * Run storage pipeline stage. Resolves to a `stage_job` save receipt.
   * @param {Object} request - StorageRequest; `idempotencyKey` reuses a persisted key
   * @returns {Promise<import('./receipt.js').SaveReceipt>}
   */
  async runStorage(request) {
    return this._stage('storage', request);
  }

  /**
   * Run linking pipeline stage. Resolves to a `stage_job` save receipt.
   * @param {Object} request - LinkingRequest; `idempotencyKey` reuses a persisted key
   * @returns {Promise<import('./receipt.js').SaveReceipt>}
   */
  async runLinking(request) {
    return this._stage('linking', request);
  }

  /**
   * Run enrichment pipeline stage. Resolves to a `stage_job` save receipt.
   * @param {Object} request - EnrichmentRequest; `idempotencyKey` reuses a persisted key
   * @returns {Promise<import('./receipt.js').SaveReceipt>}
   */
  async runEnrichment(request) {
    return this._stage('enrichment', request);
  }

  /**
   * Run grounding pipeline stage. Resolves to a `stage_job` save receipt.
   * @param {Object} request - GroundingRequest; `idempotencyKey` reuses a persisted key
   * @returns {Promise<import('./receipt.js').SaveReceipt>}
   */
  async runGrounding(request) {
    return this._stage('grounding', request);
  }

  // === STATE MANAGEMENT ===

  /**
   * Get pipeline state for a specific pipeline and optional run.
   * @param {string} pipelineId
   * @param {string} [runId]
   */
  async getState(pipelineId, runId = null) {
    let url = `/memory/pipeline/${pipelineId}/state`;
    if (runId) url += `?run_id=${encodeURIComponent(runId)}`;
    return this.api.get(url);
  }

  /**
   * Reset a pipeline, clearing its state.
   * @param {string} pipelineId
   */
  async reset(pipelineId) {
    return this.api.delete(`/memory/pipeline/${pipelineId}`);
  }

  /**
   * Clear all stage states for a specific pipeline run.
   * @param {string} pipelineId
   * @param {string} runId
   */
  async clearRun(pipelineId, runId) {
    return this.api.delete(`/memory/pipeline/${pipelineId}/run/${runId}`);
  }

  // === CONFIG MANAGEMENT ===

  /**
   * List named pipeline configs for the current workspace.
   */
  async listConfigs() {
    return this.api.get('/memory/pipeline/configs');
  }

  /**
   * Save a named pipeline config.
   * @param {Object} params
   * @param {string} params.name
   * @param {string} [params.description='']
   * @param {Object} params.config
   */
  async createConfig({ name, description = '', config }) {
    return this.api.post('/memory/pipeline/configs', {
      name,
      description,
      config
    });
  }

  /**
   * Load a named pipeline config.
   * @param {string} configName
   */
  async getConfig(configName) {
    return this.api.get(`/memory/pipeline/configs/${configName}`);
  }

  /**
   * Update an existing pipeline config.
   * @param {string} configName
   * @param {Object} params
   * @param {string} [params.name='']
   * @param {string} [params.description='']
   * @param {Object} [params.config={}]
   */
  async updateConfig(configName, { name = '', description = '', config = {} }) {
    return this.api.patch(`/memory/pipeline/configs/${configName}`, {
      name,
      description,
      config
    });
  }

  /**
   * Delete a named pipeline config.
   * @param {string} configName
   */
  async deleteConfig(configName) {
    return this.api.delete(`/memory/pipeline/configs/${configName}`);
  }
}

/**
 * A dependent-stage rejection carrying the public `stage_client_error` body becomes a `StageChainError`
 * with the same code; any other error is returned untouched (a bare 404 is not proof of `stage_scope_denied`).
 */
function mapStageError(error) {
  if (!(error instanceof APIError)) return error;
  const body = error.detail?.detail && typeof error.detail.detail === 'object' ? error.detail.detail : error.detail;
  if (!body || typeof body !== 'object' || !STAGE_CHAIN_CODES.includes(body.code)) return error;
  const mapped = new StageChainError(body.message || body.code, body.code, {
    status: error.status, detail: error.detail, run_id: body.run_id ?? null, retryable: body.retryable === true,
  });
  if (error.idempotencyKey) mapped.idempotencyKey = error.idempotencyKey;
  return mapped;
}
