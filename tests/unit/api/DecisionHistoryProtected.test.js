// DECISION-DOOR-1 shape (b): the service's 409 decision_history_protected reaches the caller as a typed error.
import { describe, it, expect } from 'vitest';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { APIError, DecisionHistoryProtectedError } from '../../../src/index.js';
import { mapAdmissionError } from '../../../src/api/submit.js';

const reply = (status, body) => ({
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
});

const REFUSAL = {
  detail: {
    error_code: 'decision_history_protected',
    error: 'decision_history_protected',
    message: "A decision's history ... was not applied.",
  },
};

describe('decision_history_protected', () => {
  it('maps the 409 to DecisionHistoryProtectedError, still an APIError', async () => {
    const error = await new BaseAPI({})._handleError(reply(409, REFUSAL));
    expect(error).toBeInstanceOf(DecisionHistoryProtectedError);
    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('decision_history_protected');
    expect(error.message).toBe(REFUSAL.detail.message);
    expect(error.detail).toEqual(REFUSAL);
  });

  it('leaves other 409s and other statuses as plain APIError', async () => {
    const base = new BaseAPI({});
    const other = await base._handleError(reply(409, { detail: { error_code: 'version_mismatch' } }));
    expect(other).not.toBeInstanceOf(DecisionHistoryProtectedError);
    const wrongStatus = await base._handleError(reply(422, REFUSAL));
    expect(wrongStatus).not.toBeInstanceOf(DecisionHistoryProtectedError);
  });

  it('survives the save path admission mapping untouched', async () => {
    const error = await new BaseAPI({})._handleError(reply(409, REFUSAL));
    expect(mapAdmissionError(error)).toBe(error);
  });
});
