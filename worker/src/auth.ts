import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 5 * 60 * 1000; // 5-minute replay window

export function signRequest(body: string, secret: string): { timestamp: string; signature: string } {
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(timestamp + body)
    .digest("hex");
  return { timestamp, signature };
}

export function verifyRequest(
  timestamp: string | undefined,
  signature: string | undefined,
  body: string,
  secret: string,
): boolean {
  if (!timestamp || !signature) return false;

  // Replay protection
  const age = Math.abs(Date.now() - parseInt(timestamp, 10));
  if (isNaN(age) || age > MAX_AGE_MS) return false;

  const expected = createHmac("sha256", secret)
    .update(timestamp + body)
    .digest("hex");

  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
