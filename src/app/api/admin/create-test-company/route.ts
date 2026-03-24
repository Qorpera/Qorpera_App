import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanupTestOperators, runDemoSeed } from "@/lib/demo/seed-runner";
import { COMPANY } from "@/lib/demo/seed-data";

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Idempotent: remove any existing test operators
    await cleanupTestOperators();

    // Create fresh operator
    const operator = await prisma.operator.create({
      data: {
        displayName: COMPANY.name,
        companyName: COMPANY.name,
        industry: COMPANY.industry,
        isTestOperator: true,
      },
    });

    // Seed all demo data
    const result = await runDemoSeed(operator.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create test company:", error);
    return NextResponse.json(
      { error: "Failed to create test company", details: String(error) },
      { status: 500 },
    );
  }
}
