import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptConfig } from "@/lib/config-encryption";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchSlackChannels(botToken: string): Promise<Array<{ id: string; name: string; is_private: boolean }>> {
  const channels: Array<{ id: string; name: string; is_private: boolean }> = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    if (!data.ok) break;

    for (const ch of data.channels || []) {
      channels.push({ id: ch.id, name: ch.name, is_private: ch.is_private });
    }
    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return channels;
}

async function validateSlackConnector(connectorId: string, operatorId: string) {
  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, operatorId, deletedAt: null },
  });
  if (!connector) return { error: "Connector not found", status: 404 };
  if (connector.provider !== "slack") return { error: "Connector is not a Slack connector", status: 400 };
  return { connector };
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id: connectorId } = await params;

  const result = await validateSlackConnector(connectorId, operatorId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { connector } = result;

  // Get existing mappings with domain name
  const mappings = await prisma.slackChannelMapping.findMany({
    where: { connectorId, operatorId },
    include: { domain: { select: { id: true, displayName: true } } },
    orderBy: { channelName: "asc" },
  });

  // Fetch available Slack channels
  let availableChannels: Array<{ id: string; name: string; is_private: boolean }> = [];
  try {
    const config = connector.config ? decryptConfig(connector.config) : {};
    const botToken = (config.bot_token || config.access_token || config.token) as string;
    if (botToken) {
      availableChannels = await fetchSlackChannels(botToken);
    }
  } catch {
    // Non-fatal — return mappings without available channels
  }

  return NextResponse.json({ mappings, availableChannels });
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id: connectorId } = await params;

  const result = await validateSlackConnector(connectorId, operatorId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await req.json();
  const { channelId, channelName, domainId } = body;
  if (!channelId || !channelName || !domainId) {
    return NextResponse.json({ error: "channelId, channelName, and domainId are required" }, { status: 400 });
  }

  // Validate domain belongs to same operator
  const dept = await prisma.entity.findFirst({
    where: { id: domainId, operatorId, category: "foundational" },
    select: { id: true },
  });
  if (!dept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 400 });
  }

  const mapping = await prisma.slackChannelMapping.upsert({
    where: { connectorId_channelId: { connectorId, channelId } },
    create: { operatorId, connectorId, channelId, channelName, domainId },
    update: { channelName, domainId },
    include: { domain: { select: { id: true, displayName: true } } },
  });

  return NextResponse.json(mapping, { status: 201 });
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id: connectorId } = await params;

  const result = await validateSlackConnector(connectorId, operatorId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await req.json();
  const { channelId } = body;
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  const existing = await prisma.slackChannelMapping.findUnique({
    where: { connectorId_channelId: { connectorId, channelId } },
  });
  if (!existing || existing.operatorId !== operatorId) {
    return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
  }

  await prisma.slackChannelMapping.delete({
    where: { connectorId_channelId: { connectorId, channelId } },
  });

  return NextResponse.json({ ok: true });
}
