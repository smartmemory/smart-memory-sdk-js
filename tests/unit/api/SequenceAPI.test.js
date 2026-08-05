import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SequenceAPI } from '../../../src/api/SequenceAPI.js';

const allocation = {
  name: 'compose:idea',
  value: 413,
  first: 413,
  count: 1,
};

const sequenceError = (status, reason) => ({
  status,
  detail: { detail: { reason } },
});

describe('SequenceAPI', () => {
  let baseAPI;
  let api;

  beforeEach(() => {
    baseAPI = {
      post: vi.fn().mockResolvedValue(allocation),
      get: vi.fn().mockResolvedValue({ name: 'compose:idea', value: 413 }),
    };
    api = new SequenceAPI(baseAPI);
  });

  describe('allocate', () => {
    it('returns the complete allocation body', async () => {
      await expect(api.allocate('compose:idea', { floor: 412 })).resolves.toEqual(allocation);
      expect(baseAPI.post).toHaveBeenCalledWith('/memory/sequences/compose:idea/next', {
        floor: 412,
      });
    });

    it('sends an empty body when no options are given', async () => {
      await api.allocate('compose:idea');
      expect(baseAPI.post).toHaveBeenCalledWith('/memory/sequences/compose:idea/next', {});
    });

    it('forwards count', async () => {
      await api.allocate('compose:idea', { count: 10 });
      expect(baseAPI.post).toHaveBeenCalledWith('/memory/sequences/compose:idea/next', {
        count: 10,
      });
    });

    // `floor: 0` is falsy but meaningful. A truthiness guard would silently
    // drop it and the counter would not be seeded.
    it('sends floor 0 rather than dropping it', async () => {
      await api.allocate('compose:idea', { floor: 0 });
      expect(baseAPI.post).toHaveBeenCalledWith('/memory/sequences/compose:idea/next', {
        floor: 0,
      });
    });

    // There is no benign failure for an allocator. Returning a sentinel on a
    // 503 would let a caller mistake coordinator failure for a value.
    it('throws on 503 rather than returning a sentinel', async () => {
      const error = sequenceError(503, 'coordinator_unavailable');
      baseAPI.post.mockRejectedValue(error);
      await expect(api.allocate('compose:idea')).rejects.toBe(error);
    });

    it('throws on 429 quota', async () => {
      const error = sequenceError(429, 'sequence_quota_exceeded');
      baseAPI.post.mockRejectedValue(error);
      await expect(api.allocate('compose:idea')).rejects.toBe(error);
    });

    it('throws on 422 validation', async () => {
      const error = { status: 422, detail: { detail: [] } };
      baseAPI.post.mockRejectedValue(error);
      await expect(api.allocate('compose:idea')).rejects.toBe(error);
    });
  });

  describe('peek', () => {
    it('returns the current value', async () => {
      await expect(api.peek('compose:idea')).resolves.toBe(413);
      expect(baseAPI.get).toHaveBeenCalledWith('/memory/sequences/compose:idea');
    });

    it('returns null for an unknown sequence', async () => {
      baseAPI.get.mockRejectedValue(sequenceError(404, 'sequence_not_found'));
      await expect(api.peek('compose:idea')).resolves.toBeNull();
    });

    // "coordinator down" is a different answer from "never allocated", and
    // collapsing them would let a caller re-seed a live counter from scratch.
    it('throws on 503 rather than reporting absence', async () => {
      const error = sequenceError(503, 'coordinator_unavailable');
      baseAPI.get.mockRejectedValue(error);
      await expect(api.peek('compose:idea')).rejects.toBe(error);
    });
  });
});
