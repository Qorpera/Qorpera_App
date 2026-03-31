/**
 * Determines if an error is systemic (affects all jobs of the same type)
 * vs. per-job (specific to this job's data/payload).
 *
 * Systemic errors: API down, auth failure, rate limit, network issues.
 * Per-job errors: JSON parse failure, missing entity, validation error.
 */
export function isSystemicError(message: string): boolean {
  const patterns = [
    /ECONNREFUSED/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENETUNREACH/i,
    /\b401\b/,
    /403.*forbidden/i,
    /\b429\b/,
    /500.*internal.*server/i,
    /502.*bad.*gateway/i,
    /503.*unavailable/i,
    /API key/i,
    /authentication/i,
    /unauthorized/i,
    /quota.*exceeded/i,
    /rate.?limit/i,
    /too many requests/i,
  ];
  return patterns.some(p => p.test(message));
}
