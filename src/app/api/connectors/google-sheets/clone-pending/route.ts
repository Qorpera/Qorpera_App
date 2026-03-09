import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

export async function POST() {
  const operatorId = await getOperatorId();

  // Find an existing active google-sheets connector to clone tokens from
  const source = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "google-sheets", status: "active" },
    orderBy: { createdAt: "desc" },
  });

  if (!source?.config) {
    return NextResponse.json(
      { error: "No active Google Sheets connector to clone from" },
      { status: 404 }
    );
  }

  const config = JSON.parse(decrypt(source.config));

  const connector = await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: "google-sheets",
      name: "",
      status: "pending",
      config: encrypt(JSON.stringify({
        access_token: config.access_token,
        refresh_token: config.refresh_token,
        token_expiry: config.token_expiry,
        spreadsheet_id: "",
      })),
    },
  });

  return NextResponse.json({ connector }, { status: 201 });
}
