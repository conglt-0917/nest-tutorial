export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Emails are compared and stored trimmed and in lowercase. */
export function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
