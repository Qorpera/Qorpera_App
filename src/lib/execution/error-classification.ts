/**
 * Three-tier error classification for execution engine step failures.
 *
 * - transient: retry with backoff (network issues, rate limits, server errors)
 * - permanent: this request won't work, trigger plan amendment
 * - catastrophic: system-level failure, halt plan and alert admins
 */

// ── Types ───────────────────────────────────────────────

export type ErrorClass = "transient" | "permanent" | "catastrophic";

// ── Classification ──────────────────────────────────────

export function classifyError(error: unknown, stepType: string): ErrorClass {
  const status = extractHttpStatus(error);
  const message = extractErrorMessage(error);

  if (isCatastrophic(status, message)) return "catastrophic";
  if (isTransient(status, message)) return "transient";
  return "permanent";
}

// ── Helpers ─────────────────────────────────────────────

export function extractHttpStatus(error: unknown): number | null {
  if (error == null) return null;

  // Axios-style: error.response.status
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;

    // Direct status
    if (typeof e.status === "number") return e.status;
    if (typeof e.statusCode === "number") return e.statusCode;

    // Axios response wrapper
    if (e.response && typeof e.response === "object") {
      const resp = e.response as Record<string, unknown>;
      if (typeof resp.status === "number") return resp.status;
      if (typeof resp.statusCode === "number") return resp.statusCode;
    }
  }

  return null;
}

export function extractErrorMessage(error: unknown): string {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;

    // Axios-style: error.response.data.message or error.response.data.error
    if (e.response && typeof e.response === "object") {
      const resp = e.response as Record<string, unknown>;
      if (resp.data && typeof resp.data === "object") {
        const data = resp.data as Record<string, unknown>;
        if (typeof data.message === "string") return data.message;
        if (typeof data.error === "string") return data.error;
      }
    }

    // Prisma errors
    if (typeof e.code === "string" && e.code.startsWith("P")) {
      return `Prisma error ${e.code}: ${typeof e.meta === "object" ? JSON.stringify(e.meta) : ""}`;
    }
  }

  return "Unknown error";
}

function isCatastrophic(status: number | null, message: string): boolean {
  const lowerMsg = message.toLowerCase();

  // Keyword-based catastrophic signals
  const catastrophicKeywords = [
    "deauthorized",
    "revoked",
    "permanently",
    "suspended",
    "token has been revoked",
    "access token expired and refresh failed",
    "service discontinued",
    "account disabled",
    "organization suspended",
  ];

  if (catastrophicKeywords.some((kw) => lowerMsg.includes(kw))) return true;

  return false;
}

function isTransient(status: number | null, message: string): boolean {
  // HTTP status codes indicating transient failures
  if (status !== null) {
    if (status === 429) return true; // Rate limited
    if (status >= 500 && status <= 504) return true; // Server errors
  }

  const lowerMsg = message.toLowerCase();

  // Network errors
  const transientKeywords = [
    "etimedout",
    "econnreset",
    "econnrefused",
    "enotfound",
    "socket hang up",
    "network error",
    "fetch failed",
    "abort",
    "timeout",
    "too many requests",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
  ];

  if (transientKeywords.some((kw) => lowerMsg.includes(kw))) return true;

  return false;
}

// ── Error Message Sanitization ──────────────────────────

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Remove stack traces (lines starting with "at ")
  sanitized = sanitized.replace(/\s+at\s+.+/g, "");

  // Remove file paths with optional line/column numbers (Unix and Windows)
  sanitized = sanitized.replace(/\/[\w\-.\/]+\.(ts|js|tsx|jsx|json)(:\d+)*/g, "[path]");
  sanitized = sanitized.replace(/[A-Z]:\\[\w\\\-.]+\.(ts|js|tsx|jsx|json)(:\d+)*/g, "[path]");

  // Remove API keys / tokens (long hex or base64 strings)
  sanitized = sanitized.replace(/[A-Za-z0-9_\-]{32,}/g, "[redacted]");

  // Remove internal URLs (localhost, internal hostnames)
  sanitized = sanitized.replace(/https?:\/\/localhost[:\d]*/g, "[internal-url]");
  sanitized = sanitized.replace(/https?:\/\/[\w\-.]+\.internal[:\d\/]*/g, "[internal-url]");

  // Truncate to 500 chars
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 497) + "...";
  }

  return sanitized.trim();
}
