/**
 * Microsoft Application Permissions auth layer.
 *
 * Uses client credentials flow to obtain tenant-level tokens.
 * The app authenticates as itself with admin-consented permissions,
 * then uses per-user Graph API endpoints (/users/{email}/...).
 */

/**
 * Get an app-level access token for a specific Azure AD tenant.
 * Uses client credentials flow — no user interaction needed.
 */
export async function getAppAccessToken(tenantId: string): Promise<string> {
  const clientId = process.env.MICROSOFT_APP_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft Application Permissions not configured (MICROSOFT_APP_CLIENT_ID / MICROSOFT_APP_CLIENT_SECRET missing)");
  }

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Microsoft client credentials token failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.access_token;
}

/**
 * Get an access token scoped to a specific user's mailbox/files/calendar.
 * For Application Permissions, the app token itself has tenant-wide access.
 * We pass the userEmail to the calling code so it knows which user's data to query.
 *
 * Unlike Google delegation (which impersonates per-user), Microsoft Application
 * Permissions use a single app token and specify the user in the API endpoint:
 *   /users/{userEmail}/messages  (not /me/messages)
 */
export async function getAppTokenForUser(tenantId: string, _userEmail: string): Promise<string> {
  return getAppAccessToken(tenantId);
}

/**
 * List all users in an Azure AD / Entra ID tenant via Microsoft Graph.
 */
export async function listTenantUsers(tenantId: string): Promise<Array<{
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  department: string;
  title: string;
  isAdmin: boolean;
}>> {
  const token = await getAppAccessToken(tenantId);
  const users: Array<any> = [];
  let nextLink: string | undefined = "https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,givenName,surname,mail,userPrincipalName,department,jobTitle,accountEnabled&$filter=accountEnabled eq true";

  while (nextLink) {
    const resp: Response = await fetch(nextLink, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Graph users list failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    if (data.value) users.push(...data.value);
    nextLink = data["@odata.nextLink"] || undefined;
  }

  // Check who has admin roles (Global Administrator role template ID)
  let adminEmails = new Set<string>();
  try {
    const adminResp = await fetch(
      "https://graph.microsoft.com/v1.0/directoryRoles/roleTemplateId=62e90394-69f5-4237-9190-012177145e10/members?$select=userPrincipalName",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (adminResp.ok) {
      const adminData = await adminResp.json();
      adminEmails = new Set((adminData.value || []).map((u: any) => (u.userPrincipalName || "").toLowerCase()));
    }
  } catch {
    // Admin role check is best-effort
  }

  return users.map((u: any) => ({
    email: (u.mail || u.userPrincipalName || "").toLowerCase(),
    fullName: u.displayName || "",
    givenName: u.givenName || "",
    familyName: u.surname || "",
    department: u.department || "",
    title: u.jobTitle || "",
    isAdmin: adminEmails.has((u.userPrincipalName || "").toLowerCase()),
  })).filter((u) => u.email);
}

/**
 * Test that Application Permissions are configured and working.
 */
export async function testMicrosoftAppAccess(tenantId: string): Promise<{
  success: boolean;
  userCount?: number;
  error?: string;
}> {
  try {
    const users = await listTenantUsers(tenantId);
    return { success: true, userCount: users.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("401") || message.includes("unauthorized")) {
      return {
        success: false,
        error: "App registration not authorized. Please verify the Application ID and that admin consent has been granted.",
      };
    }
    if (message.includes("403") || message.includes("Authorization_RequestDenied")) {
      return {
        success: false,
        error: "Insufficient permissions. Please grant admin consent for Mail.Read, Files.Read.All, Calendars.Read, User.Read.All, and Directory.Read.All.",
      };
    }
    if (message.includes("AADSTS700016") || message.includes("not found in the directory")) {
      return {
        success: false,
        error: "Application not found in this tenant. Please verify the Application ID is correct.",
      };
    }

    return { success: false, error: message };
  }
}

/**
 * Get the Application (client) ID for display in the onboarding UI.
 */
export function getMicrosoftAppClientId(): string | null {
  return process.env.MICROSOFT_APP_CLIENT_ID || null;
}

/** Required Microsoft Graph API permissions for Application Permissions. */
export const REQUIRED_PERMISSIONS = [
  "Mail.Read",
  "Files.Read.All",
  "Calendars.Read",
  "User.Read.All",
  "Directory.Read.All",
];
