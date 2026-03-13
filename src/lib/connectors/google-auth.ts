import type { ConnectorConfig } from "./types";

export async function getValidAccessToken(
  config: ConnectorConfig
): Promise<string> {
  const expiry = new Date(config.token_expiry as string);

  if (expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: config.refresh_token as string,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) throw new Error(`Google token refresh failed: ${resp.status}`);
  const data = await resp.json();

  // Mutate config so the caller can persist updated tokens
  config.access_token = data.access_token;
  config.token_expiry = new Date(
    Date.now() + data.expires_in * 1000
  ).toISOString();

  return data.access_token;
}

