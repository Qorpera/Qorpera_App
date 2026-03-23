/**
 * Internal API utilities for self-chaining serverless invocations.
 *
 * INTERNAL_API_KEY: shared secret for internal-only API calls.
 * Dev passthrough: if not set, accept all internal calls.
 */

export function validateInternalKey(request: Request): boolean {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return true; // Dev passthrough
  return request.headers.get("x-internal-key") === key;
}

export function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function triggerNextIteration(runId: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/onboarding/agents/iterate`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": process.env.INTERNAL_API_KEY || "",
      // Origin header required by CSRF middleware for POST requests
      "Origin": baseUrl,
    },
    body: JSON.stringify({ runId }),
  }).catch((err) => console.error("Failed to chain iteration:", err));
}
