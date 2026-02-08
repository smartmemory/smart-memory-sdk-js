import { describe, it, expect } from 'vitest';
import { APIError } from '../../../src/errors/APIError.js';

describe('APIError', () => {
  it('should create error with message, status, and detail', () => {
    const error = new APIError('Not found', 404, { code: 'NOT_FOUND' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(APIError);
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.detail).toEqual({ code: 'NOT_FOUND' });
    expect(error.name).toBe('APIError');
  });

  it('should default status to 0 and detail to null', () => {
    const error = new APIError('Network error');

    expect(error.status).toBe(0);
    expect(error.detail).toBeNull();
  });

  it('should be catchable as Error', () => {
    try {
      throw new APIError('Test', 500);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.status).toBe(500);
    }
  });
});
