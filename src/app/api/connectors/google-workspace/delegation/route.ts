import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptConfig } from "@/lib/config-encryption";
import { listDomainUsers } from "@/lib/connectors/google-workspace-delegation";
import { createTeamMemberEntities } from "@/lib/connectors/delegation-entity-creator";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = session;

  const { domain, adminEmail } = await req.json();
  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }
  if (!adminEmail || typeof adminEmail !== "string" || !adminEmail.includes("@")) {
    return NextResponse.json({ error: "adminEmail must be a valid email" }, { status: 400 });
  }

  // List domain users
  let users;
  try {
    users = await listDomainUsers(domain, adminEmail);
  } catch (err) {
    return NextResponse.json(
      { error: `Delegation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  // Create per-employee Google connectors
  let connectorCount = 0;
  for (const user of users) {
    if (!user.email) continue;

    const existing = await prisma.sourceConnector.findFirst({
      where: { operatorId, provider: "google", name: `Google Workspace (${user.email})` },
    });

    const config = encryptConfig({
      delegation_type: "domain-wide",
      impersonated_email: user.email,
      domain,
      admin_email: adminEmail,
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
          provider: "google",
          name: `Google Workspace (${user.email})`,
          status: "active",
          config,
          userId: null,
        },
      });
      connectorCount++;
    }
  }

  // Create team-member entities
  const entityCount = await createTeamMemberEntities(operatorId, users, "google-admin-sdk");

  // Update delegation-meta connector
  const metaConfig = encryptConfig({
    domain,
    adminEmail,
    delegation_type: "domain-wide",
    userCount: users.length,
    lastSynced: new Date().toISOString(),
    users: users.map((u) => ({
      email: u.email,
      fullName: u.fullName,
      department: u.department,
      title: u.title,
      orgUnitPath: u.orgUnitPath,
      isAdmin: u.isAdmin,
    })),
  });

  const existingMeta = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "google-delegation-meta" },
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
        provider: "google-delegation-meta",
        name: "Google Workspace Delegation",
        status: "active",
        config: metaConfig,
      },
    });
  }

  return NextResponse.json({
    success: true,
    connectorCount,
    employeeCount: users.length,
    entityCount,
  });
}
