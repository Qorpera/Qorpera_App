export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate environment variables before anything else
    const { validateEnv } = await import("@/lib/env-validation");
    const result = validateEnv();

    for (const warning of result.warnings) {
      console.warn(`[ENV] ${warning}`);
    }

    if (!result.valid) {
      console.error('=== ENVIRONMENT VALIDATION FAILED ===');
      for (const error of result.errors) {
        console.error(`[ENV] ${error}`);
      }
      console.error('=====================================');
      process.exit(1);
    }

    console.log('[ENV] Environment validation passed');

    // Start background crons
    const { startSituationCrons } = await import("@/lib/situation-cron");
    startSituationCrons();
  }
}
