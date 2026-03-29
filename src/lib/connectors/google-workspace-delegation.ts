import { JWT } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
];

/**
 * Parse the base64-encoded service account key from env.
 * Returns null if not configured.
 */
export function getServiceAccountCredentials(): {
  client_email: string;
  private_key: string;
  project_id: string;
} | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    console.error("[google-delegation] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY");
    return null;
  }
}

/**
 * Get an access token impersonating a specific user.
 * Uses the service account with domain-wide delegation to act as `userEmail`.
 */
export async function getImpersonatedAccessToken(userEmail: string): Promise<string> {
  const creds = getServiceAccountCredentials();
  if (!creds) throw new Error("Service account not configured (GOOGLE_SERVICE_ACCOUNT_KEY missing)");

  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
    subject: userEmail,
  });

  const tokenResponse = await client.authorize();
  if (!tokenResponse.access_token) {
    throw new Error(`Failed to get impersonated token for ${userEmail}`);
  }
  return tokenResponse.access_token;
}

/**
 * List all users on a Google Workspace domain via Admin SDK.
 * Requires `admin.directory.user.readonly` scope and delegation from a domain admin.
 */
export async function listDomainUsers(
  domain: string,
  adminEmail: string
): Promise<Array<{
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  orgUnitPath: string;
  department: string;
  title: string;
  isAdmin: boolean;
  isSuspended: boolean;
}>> {
  const token = await getImpersonatedAccessToken(adminEmail);
  const users: Array<any> = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
    url.searchParams.set("domain", domain);
    url.searchParams.set("maxResults", "500");
    url.searchParams.set("projection", "full");
    url.searchParams.set("orderBy", "email");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Admin SDK users.list failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    if (data.users) users.push(...data.users);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return users
    .filter((u: any) => !u.suspended)
    .map((u: any) => ({
      email: u.primaryEmail || "",
      fullName: u.name?.fullName || "",
      givenName: u.name?.givenName || "",
      familyName: u.name?.familyName || "",
      orgUnitPath: u.orgUnitPath || "/",
      department: u.organizations?.[0]?.department || "",
      title: u.organizations?.[0]?.title || "",
      isAdmin: u.isAdmin || false,
      isSuspended: false,
    }));
}

/**
 * Test that domain-wide delegation is active and working.
 * Tries to list users — returns user count on success, error message on failure.
 */
export async function testDelegationAccess(
  domain: string,
  adminEmail: string
): Promise<{ success: boolean; userCount?: number; error?: string }> {
  try {
    const users = await listDomainUsers(domain, adminEmail);
    return { success: true, userCount: users.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("401") || message.includes("unauthorized")) {
      return {
        success: false,
        error: "Delegation not yet active — it can take up to 24 hours to propagate (usually 5-15 minutes). Please try again shortly.",
      };
    }
    if (message.includes("403") || message.includes("forbidden")) {
      return {
        success: false,
        error: "Access denied. Please verify the Client ID and scopes were entered correctly in the Google Admin Console, and that the authorizing user is a Super Admin.",
      };
    }
    if (message.includes("400")) {
      return {
        success: false,
        error: `Invalid domain "${domain}". Please enter your Google Workspace domain (e.g., yourcompany.dk).`,
      };
    }

    return { success: false, error: message };
  }
}

/**
 * Get the service account client ID for display in the onboarding UI.
 * This is the value the admin pastes into Google Admin Console.
 */
export function getDelegationClientId(): string | null {
  return process.env.GOOGLE_DELEGATION_CLIENT_ID || null;
}

/** Comma-separated scopes string for Google Admin Console. */
export const DELEGATION_SCOPES_STRING = SCOPES.join(",");
