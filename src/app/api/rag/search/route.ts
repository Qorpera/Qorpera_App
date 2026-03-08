import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { retrieveRelevantContext } from "@/lib/rag/retriever";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();

  const { query, departmentIds } = body as {
    query: string;
    departmentIds?: string[];
  };

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' string" }, { status: 400 });
  }

  const results = await retrieveRelevantContext(
    query,
    operatorId,
    departmentIds ?? [],
    5,
  );

  return NextResponse.json({ results });
}
