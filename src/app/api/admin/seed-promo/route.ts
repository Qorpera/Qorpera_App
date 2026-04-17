import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanupPromoOperator, runPromoSeed } from "@/lib/demo/seed-promo";

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Idempotent: remove any existing promo operator tied to demo@company.dk
    await cleanupPromoOperator();

    const operator = await prisma.operator.create({
      data: {
        displayName: "Demo Company",
        companyName: "Demo Company",
        companyDomain: "company.dk",
        isTestOperator: true,
        billingStatus: "active",
      },
    });

    const result = await runPromoSeed(operator.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create promo operator:", error);
    return NextResponse.json(
      { error: "Failed to create promo operator", details: String(error) },
      { status: 500 },
    );
  }
}
