import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createSourceFromText } from "@/lib/source-library";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { title, authors, domain, domains, sourceType, rawMarkdown, publicationYear, notes } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!rawMarkdown || typeof rawMarkdown !== "string" || rawMarkdown.length < 100) {
    return NextResponse.json({ error: "rawMarkdown is required (minimum 100 characters)" }, { status: 400 });
  }

  const sourceId = await createSourceFromText({
    title,
    authors: authors || undefined,
    domain: domain || undefined,
    domains: Array.isArray(domains) ? domains : [],
    sourceType: sourceType || "research",
    sourceAuthority: "foundational",
    rawMarkdown,
    publicationYear: typeof publicationYear === "number" ? publicationYear : undefined,
    notes: notes || undefined,
  });

  await enqueueWorkerJob("process_source_document", su.operatorId, { sourceId });

  return NextResponse.json({ sourceId, status: "queued" }, { status: 202 });
}
