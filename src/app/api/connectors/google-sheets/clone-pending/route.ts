import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptConfig, encryptConfig } from "@/lib/config-encryption";
import { ACTIVE_CONNECTOR } from "@/lib/connector-filters";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;

  // Find an existing active google-sheets connector to clone tokens from
  const source = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "google-sheets", status: "active", ...ACTIVE_CONNECTOR },
    orderBy: { createdAt: "desc" },
  });

  if (!source?.config) {
    return NextResponse.json(
      { error: "No active Google Sheets connector to clone from" },
      { status: 404 }
    );
  }

  const config = decryptConfig(source.config) as Record<string, any>;

  const connector = await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: "google-sheets",
      name: "",
      status: "pending",
      config: encryptConfig({
        access_token: config.access_token,
        refresh_token: config.refresh_token,
        token_expiry: config.token_expiry,
        spreadsheet_id: "",
      }),
    },
  });

  return NextResponse.json({ connector }, { status: 201 });
}
