export function captureApiError(error: unknown, context?: Record<string, string>) {
  try {
    const Sentry = require("@sentry/nextjs");
    if (context) Sentry.setContext("api", context);
    Sentry.captureException(error);
  } catch {
    // Sentry not available, ignore
  }
}
