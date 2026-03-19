import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateDepartmentGoals, evaluateHQGoals } from "@/lib/initiative-reasoning";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { departmentId } = body;

  if (departmentId) {
    const dept = await prisma.entity.findFirst({
      where: {
        id: departmentId,
        operatorId,
        category: "foundational",
        status: "active",
      },
    });
    if (!dept) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    evaluateDepartmentGoals(departmentId, operatorId).catch(err =>
      console.error("[initiatives/evaluate] Department evaluation failed:", err),
    );
  } else {
    evaluateHQGoals(operatorId).catch(err =>
      console.error("[initiatives/evaluate] HQ evaluation failed:", err),
    );
  }

  return NextResponse.json({ status: "evaluation_started" });
}
