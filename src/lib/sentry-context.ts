export function setSentryContext(user: { id: string; operatorId: string; role: string; email: string }) {
  try {
    const Sentry = require("@sentry/nextjs");
    Sentry.setUser({ id: user.id, email: user.email });
    Sentry.setTag("operatorId", user.operatorId);
    Sentry.setTag("userRole", user.role);
  } catch {
    // Sentry not available, ignore
  }
}
