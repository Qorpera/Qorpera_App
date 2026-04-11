import { prisma } from "@/lib/db";
import { decryptConfig, encryptConfig } from "@/lib/config-encryption";
import { isConsumerDomain } from "@/lib/provider-discovery";
import { listTenantUsers } from "@/lib/connectors/microsoft-365-delegation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredAccountEntry {
  email: string;
  displayName?: string;
  title?: string;
  department?: string;
  domain: string;
  status: "approved" | "excluded";
  exclusionReason?: string;
}

// ── Discovery ─────────────────────────────────────────────────────────────────

export async function discoverOrganizationAccounts(
  operatorId: string,
): Promise<DiscoveredAccountEntry[]> {
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyDomain: true },
  });

  if (!operator?.companyDomain) {
    throw new Error("Company domain is not configured. Set it in operator settings or register with a business email.");
  }

  const companyDomain = operator.companyDomain;

  // Find admin connector (Microsoft delegation or Google)
  const adminConnector = await prisma.sourceConnector.findFirst({
    where: {
      operatorId,
      provider: { in: ["microsoft", "microsoft-delegation-meta", "google"] },
      status: "active",
    },
  });

  if (!adminConnector?.config) {
    throw new Error("No active admin connector found. Connect Microsoft 365 or Google Workspace first.");
  }

  const config = decryptConfig(adminConnector.config) as Record<string, unknown>;

  // Microsoft path: list tenant users via Graph API
  const tenantId = config.tenantId as string | undefined;
  if (!tenantId) {
    throw new Error("Admin connector is missing tenantId configuration.");
  }

  const users = await listTenantUsers(tenantId);

  const results: DiscoveredAccountEntry[] = [];

  for (const user of users) {
    if (!user.email) continue;

    const domain = user.email.split("@")[1]?.toLowerCase() ?? "";
    let status: "approved" | "excluded" = "approved";
    let exclusionReason: string | undefined;

    if (isConsumerDomain(domain)) {
      status = "excluded";
      exclusionReason = "consumer_domain";
    } else if (domain !== companyDomain) {
      status = "excluded";
      exclusionReason = "domain_mismatch";
    }

    // Upsert to DiscoveredAccount — don't overwrite manual user decisions on update
    const record = await prisma.discoveredAccount.upsert({
      where: { operatorId_email: { operatorId, email: user.email } },
      create: {
        operatorId,
        email: user.email,
        displayName: user.fullName || undefined,
        title: user.title || undefined,
        department: user.department || undefined,
        domain,
        status,
        exclusionReason: exclusionReason ?? null,
        approvedAt: status === "approved" ? new Date() : null,
      },
      update: {
        displayName: user.fullName || undefined,
        title: user.title || undefined,
        department: user.department || undefined,
        domain,
      },
      select: { status: true, exclusionReason: true },
    });

    results.push({
      email: user.email,
      displayName: user.fullName || undefined,
      title: user.title || undefined,
      department: user.department || undefined,
      domain,
      status: record.status as "approved" | "excluded",
      exclusionReason: record.exclusionReason ?? undefined,
    });
  }

  return results;
}

// ── Approval ──────────────────────────────────────────────────────────────────

export async function updateAccountApproval(
  operatorId: string,
  updates: Array<{ email: string; approved: boolean }>,
): Promise<void> {
  for (const { email, approved } of updates) {
    await prisma.discoveredAccount.updateMany({
      where: { operatorId, email },
      data: {
        status: approved ? "approved" : "excluded",
        exclusionReason: approved ? null : "user_excluded",
        approvedAt: approved ? new Date() : null,
      },
    });
  }
}

// ── Connector Creation ────────────────────────────────────────────────────────

export async function createApprovedConnectors(
  operatorId: string,
): Promise<{ created: number; skipped: number }> {
  // Find approved accounts without a connector
  const approvedAccounts = await prisma.discoveredAccount.findMany({
    where: { operatorId, status: "approved", connectorId: null },
  });

  if (approvedAccounts.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Load delegation meta for tenantId
  const meta = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "microsoft-delegation-meta" },
  });

  if (!meta?.config) {
    throw new Error("Microsoft delegation meta connector not found. Run delegation setup first.");
  }

  const metaConfig = decryptConfig(meta.config) as Record<string, unknown>;
  const tenantId = metaConfig.tenantId as string;

  let created = 0;
  let skipped = 0;

  for (const account of approvedAccounts) {
    // Check if a connector already exists for this email
    const existing = await prisma.sourceConnector.findFirst({
      where: { operatorId, provider: "microsoft", name: `Microsoft 365 (${account.email})` },
    });

    if (existing) {
      // Link existing connector
      await prisma.discoveredAccount.update({
        where: { id: account.id },
        data: { connectorId: existing.id, status: "connected" },
      });
      skipped++;
    } else {
      // Create new connector
      const config = encryptConfig({
        delegation_type: "app-permissions",
        tenant_id: tenantId,
        target_user_email: account.email,
      });

      const connector = await prisma.sourceConnector.create({
        data: {
          operatorId,
          provider: "microsoft",
          name: `Microsoft 365 (${account.email})`,
          status: "active",
          config,
          userId: null,
        },
      });

      await prisma.discoveredAccount.update({
        where: { id: account.id },
        data: { connectorId: connector.id, status: "connected" },
      });
      created++;
    }
  }

  return { created, skipped };
}
