import { QueryFailedError } from 'typeorm';
import { PG_UNIQUE_VIOLATION } from '../../database/database.constants.js';

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      PG_UNIQUE_VIOLATION
  );
}
