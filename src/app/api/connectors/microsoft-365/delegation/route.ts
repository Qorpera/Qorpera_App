import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptConfig, decryptConfig } from "@/lib/config-encryption";
import { listTenantUsers } from "@/lib/connectors/microsoft-365-delegation";
import { createTeamMemberEntities } from "@/lib/connectors/delegation-entity-creator";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = session;

  const url = new URL(req.url);
  const legacy = url.searchParams.get("legacy") === "true";

  let { tenantId } = await req.json().catch(() => ({ tenantId: null }));

  // Fall back to saved meta connector config
  if (!tenantId) {
    const meta = await prisma.sourceConnector.findFirst({
      where: { operatorId, provider: "microsoft-delegation-meta" },
    });
    if (meta?.config) {
      const config = decryptConfig(meta.config) as Record<string, unknown>;
      tenantId = config.tenantId as string;
    }
  }

  if (!tenantId || typeof tenantId !== "string" || !UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: "tenantId is required (UUID format)" }, { status: 400 });
  }

  // List tenant users
  let users;
  try {
    users = await listTenantUsers(tenantId);
  } catch (err) {
    return NextResponse.json(
      { error: `Delegation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  // Create team-member entities (always)
  const entityCount = await createTeamMemberEntities(operatorId, users, "microsoft-graph");

  // Update delegation-meta connector (preserve tenantId/clientSecret, add user data)
  const existingMeta = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "microsoft-delegation-meta" },
  });

  const existingMetaConfig = existingMeta?.config
    ? (decryptConfig(existingMeta.config) as Record<string, unknown>)
    : {};

  const metaConfig = encryptConfig({
    ...existingMetaConfig,
    tenantId,
    delegation_type: "app-permissions",
    userCount: users.length,
    lastSynced: new Date().toISOString(),
    users: users.map((u) => ({
      email: u.email,
      fullName: u.fullName,
      department: u.department,
      title: u.title,
      isAdmin: u.isAdmin,
    })),
  });

  if (existingMeta) {
    await prisma.sourceConnector.update({
      where: { id: existingMeta.id },
      data: { config: metaConfig, status: "active" },
    });
  } else {
    await prisma.sourceConnector.create({
      data: {
        operatorId,
        provider: "microsoft-delegation-meta",
        name: "Microsoft 365 Delegation",
        status: "active",
        config: metaConfig,
      },
    });
  }

  // ── Legacy path: create connectors directly (backward compatibility) ──────
  if (legacy) {
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { companyDomain: true },
    });
    const companyDomain = operator?.companyDomain;

    let connectorCount = 0;
    const skippedUsers: Array<{ email: string; reason: string }> = [];
    for (const user of users) {
      if (!user.email) continue;

      if (companyDomain) {
        const userDomain = user.email.split("@")[1]?.toLowerCase();
        if (userDomain && userDomain !== companyDomain) {
          skippedUsers.push({ email: user.email, reason: `domain mismatch (${userDomain} ≠ ${companyDomain})` });
          continue;
        }
      }

      const existing = await prisma.sourceConnector.findFirst({
        where: { operatorId, provider: "microsoft", name: `Microsoft 365 (${user.email})` },
      });

      const config = encryptConfig({
        delegation_type: "app-permissions",
        tenant_id: tenantId,
        target_user_email: user.email,
      });

      if (existing) {
        await prisma.sourceConnector.update({
          where: { id: existing.id },
          data: { config, status: "active" },
        });
      } else {
        await prisma.sourceConnector.create({
          data: {
            operatorId,
            provider: "microsoft",
            name: `Microsoft 365 (${user.email})`,
            status: "active",
            config,
            userId: null,
          },
        });
        connectorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      connectorCount,
      employeeCount: users.length,
      entityCount,
      ...(skippedUsers.length > 0 ? { skippedUsers } : {}),
    });
  }

  // ── New path: discovery-based flow ────────────────────────────────────────
  const { discoverOrganizationAccounts } = await import("@/lib/account-discovery");
  const accounts = await discoverOrganizationAccounts(operatorId);

  const approved = accounts.filter((a) => a.status === "approved");
  const excluded = accounts.filter((a) => a.status === "excluded");

  return NextResponse.json({
    accounts,
    totalDiscovered: accounts.length,
    approved: approved.length,
    excluded: excluded.length,
    entityCount,
    message: `Discovered ${accounts.length} accounts. ${approved.length} approved, ${excluded.length} excluded. Call POST /api/onboarding/create-connectors to create connectors for approved accounts.`,
  });
}
