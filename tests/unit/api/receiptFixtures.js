// Frozen SM2-SAVE-1 wire fixtures (save-receipt-contract.json `examples[0]` and the ST33 stage example).
// A helper, not a test file: vitest only collects *.test.js.
export const KEY_RE = /^sm2_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const RECEIPT = Object.freeze({
  schema_version: '1.1',
  subject: { kind: 'item_save', item_id: 'mem_123' },
  run_id: 'run_1',
  intake_id: 'in_1',
  status_url: '/memory/status/run_1',
  processing_stage: 'received',
  execution_state: 'queued',
  outcome: null,
  terminal: false,
  result_availability: 'pending',
  client_timed_out: false,
  placement: 'service',
  idempotency_key: 'save_req_1',
  revision: 1,
  execution_epoch: 1,
  status_version: 1,
});

export const TERMINAL = Object.freeze({
  ...RECEIPT,
  processing_stage: 'stored',
  execution_state: 'completed',
  outcome: 'completed',
  terminal: true,
  result_availability: 'available',
  status_version: 3,
});

export const STAGE_PENDING = Object.freeze({
  schema_version: '1.1',
  subject: { kind: 'stage_job', occurrence_id: 'occ_1', stage_id: 'extraction' },
  run_id: 'run_stage_1',
  status_url: '/memory/status/run_stage_1',
  processing_stage: null,
  execution_state: 'queued',
  outcome: null,
  terminal: false,
  result_availability: 'pending',
  client_timed_out: false,
});

export const STAGE_DONE = Object.freeze({
  ...STAGE_PENDING,
  execution_state: 'completed',
  outcome: 'completed',
  terminal: true,
  result_availability: 'available',
  result: { stage_id: 'extraction', pipeline_state_run_id: 'pipeline_1', output: { entities: [], relations: [] }, link_results: [] },
});
