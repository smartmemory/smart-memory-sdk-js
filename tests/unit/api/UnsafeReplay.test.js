import { expect, it, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { APIError } from '../../../src/errors/APIError.js';
import { RECEIPT } from './receiptFixtures.js';

const cases = ['lost', 408, 429, 500, 502, 503, 504];
for (const route of ['add', 'conversation']) {
  it.each(cases)(`${route} never replays an unconfirmed write: %s`, async failure => {
    const original = new APIError('unconfirmed', failure === 'lost' ? 0 : failure,
      failure === 'lost' ? 'network_error' : { detail: 'unconfirmed' });
    const post = vi.fn().mockRejectedValueOnce(original).mockResolvedValue(RECEIPT);
    const memory = new MemoryAPI({ post });
    const error = await (route === 'add'
      ? memory.create({ content: 'test_replay', idempotencyKey: 'test_replay_key' })
      : memory.ingestConversation([{ role: 'user', content: 'test_replay' }], { idempotencyKey: 'test_replay_key' }))
      .catch(e => e);
    expect(post).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(APIError);
    expect(error.name).toBe('WriteOutcomeUnknown');
    expect(error.code).toBe('write_outcome_unknown');
    expect(error.status).toBe(original.status);
    expect(error.detail).toBe(original.detail);
    expect(error.cause).toBe(original);
    expect(error.attempts).toBe(1);
    expect(error.idempotencyKey).toBe('test_replay_key');
  });
}
