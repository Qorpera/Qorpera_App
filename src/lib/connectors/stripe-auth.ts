import type { ConnectorConfig } from "./types";

const STRIPE_API = "https://api.stripe.com";

export async function getValidStripeToken(
  config: ConnectorConfig
): Promise<string> {
  const token = config.access_token as string;
  if (!token) throw new Error("No Stripe access token in config");

  // Verify the token still works by making a lightweight call
  const resp = await fetch(`${STRIPE_API}/v1/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (resp.ok) return token;

  // Token may be deauthorized — try refreshing if we have a refresh token
  const refreshToken = config.refresh_token as string;
  if (!refreshToken) {
    throw new Error("Stripe access token invalid and no refresh token available");
  }

  const refreshResp = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_secret: process.env.STRIPE_SECRET_KEY!,
      refresh_token: refreshToken,
    }),
  });

  if (!refreshResp.ok) {
    throw new Error(`Stripe token refresh failed: ${refreshResp.status}`);
  }

  const data = await refreshResp.json();

  // Mutate config so the caller can persist updated tokens
  config.access_token = data.access_token;
  if (data.refresh_token) {
    config.refresh_token = data.refresh_token;
  }

  return data.access_token;
}
