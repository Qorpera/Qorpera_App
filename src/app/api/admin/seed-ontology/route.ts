import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { seedOntology } from "@/lib/system-intelligence-ontology";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su?.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { vertical, content } = await req.json();
  if (!vertical || !content) return NextResponse.json({ error: "vertical and content required" }, { status: 400 });

  const pageId = await seedOntology(vertical, content);
  if (!pageId) return NextResponse.json({ error: "Ontology already exists for this vertical" }, { status: 409 });

  return NextResponse.json({ pageId });
}
