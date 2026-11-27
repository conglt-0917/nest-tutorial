import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './database-error.util.js';

describe('isUniqueViolation', () => {
  it('is true for a Postgres unique violation', () => {
    const error = new QueryFailedError('INSERT', [], {
      code: '23505',
    } as never);

    expect(isUniqueViolation(error)).toBe(true);
  });

  it('is false for another query failure', () => {
    const error = new QueryFailedError('INSERT', [], {
      code: '23502',
    } as never);

    expect(isUniqueViolation(error)).toBe(false);
  });

  it('is false for errors that are not query failures', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
