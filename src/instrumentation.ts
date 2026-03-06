export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSituationCrons } = await import("@/lib/situation-cron");
    startSituationCrons();
  }
}
