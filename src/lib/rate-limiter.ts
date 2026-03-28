/**
 * Rate limiter with Upstash Redis backend (production) and in-memory fallback (dev).
 * Tiered rate limiters for different API route categories.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Upstash Redis setup ─────────────────────────────────────────────────────

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export { redis };

// Tiered rate limiters (only created when Redis is available)
const globalLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(300, "1 m"), prefix: "rl:global" })
  : null;

const authLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m"), prefix: "rl:auth" })
  : null;

const billingLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "rl:billing" })
  : null;

const copilotLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "rl:copilot" })
  : null;

type Tier = "global" | "auth" | "billing" | "copilot";

const tierMap: Record<Tier, Ratelimit | null> = {
  global: globalLimiter,
  auth: authLimiter,
  billing: billingLimiter,
  copilot: copilotLimiter,
};

// ── In-memory fallback (dev / no Redis) ──────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
}

const TIER_DEFAULTS: Record<Tier, { maxRequests: number; windowMs: number }> = {
  global: { maxRequests: 300, windowMs: 60_000 },
  auth: { maxRequests: 10, windowMs: 60_000 },
  billing: { maxRequests: 5, windowMs: 60_000 },
  copilot: { maxRequests: 30, windowMs: 60_000 },
};

function inMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: maxRequests - 1, reset: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { success: false, remaining: 0, reset: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: maxRequests - entry.count, reset: entry.resetAt };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Tiered rate limiting. Uses Upstash Redis when available, in-memory fallback otherwise.
 */
export async function rateLimit(
  key: string,
  tier: Tier,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const limiter = tierMap[tier];

  if (limiter) {
    const result = await limiter.limit(key);
    return { success: result.success, remaining: result.remaining, reset: result.reset };
  }

  // In-memory fallback
  const defaults = TIER_DEFAULTS[tier];
  return inMemoryRateLimit(`${tier}:${key}`, defaults.maxRequests, defaults.windowMs);
}

/**
 * Returns a 429 Response with Retry-After header.
 */
export function rateLimitResponse(resetTimestamp: number): Response {
  const retryAfter = Math.max(1, Math.ceil((resetTimestamp - Date.now()) / 1000));
  return new Response(
    JSON.stringify({ error: "Too many requests", retryAfter }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

// ── Legacy API (backward compat for per-route callers) ───────────────────────

/**
 * @deprecated Use `rateLimit(key, tier)` for new code. Kept for per-route callers
 * with custom limits (document upload, registration, webhooks).
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const result = inMemoryRateLimit(key, maxRequests, windowMs);
  return { allowed: result.success, remaining: result.remaining, resetAt: result.reset };
}
