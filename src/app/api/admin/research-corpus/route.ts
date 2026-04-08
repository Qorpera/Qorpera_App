import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { processResearchCorpus, type CorpusDocument } from "@/lib/research-corpus-pipeline";

export const maxDuration = 300; // 5 minutes for Vercel — longer runs go to worker

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su?.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { documents, vertical, dryRun, adminReviewPlan } = body as {
    documents: CorpusDocument[];
    vertical: string;
    dryRun?: boolean;
    adminReviewPlan?: boolean;
  };

  if (!documents?.length || !vertical) {
    return NextResponse.json({ error: "documents array and vertical required" }, { status: 400 });
  }

  const report = await processResearchCorpus(documents, vertical, {
    dryRun,
    adminReviewPlan,
    onProgress: async (phase, message) => {
      console.log(`[research-corpus] [${phase}] ${message}`);
    },
  });

  return NextResponse.json(report);
}
