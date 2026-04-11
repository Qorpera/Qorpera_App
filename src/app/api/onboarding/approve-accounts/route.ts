import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { updateAccountApproval } from "@/lib/account-discovery";
import { z } from "zod";

const ApproveSchema = z.object({
  updates: z.array(
    z.object({
      email: z.string().email(),
      approved: z.boolean(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  await updateAccountApproval(session.operatorId, parsed.data.updates);
  return NextResponse.json({ success: true });
}
