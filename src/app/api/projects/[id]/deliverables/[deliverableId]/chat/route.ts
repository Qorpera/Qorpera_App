import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented — wiki-first project hierarchy. Legacy route retired in v0.3.53." },
    { status: 501 },
  );
}

export async function POST(_req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented — wiki-first project hierarchy. Legacy route retired in v0.3.53." },
    { status: 501 },
  );
}
