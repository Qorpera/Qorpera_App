import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { discoverEmailProvider, isConsumerDomain } from "@/lib/provider-discovery";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  let domain: string | undefined = body.domain;

  // Fall back to operator's companyDomain
  if (!domain) {
    const operator = await prisma.operator.findUnique({
      where: { id: session.operatorId },
      select: { companyDomain: true },
    });
    domain = operator?.companyDomain ?? undefined;
  }

  if (!domain) {
    return NextResponse.json(
      { error: "No domain provided and no company domain configured" },
      { status: 400 },
    );
  }

  domain = domain.toLowerCase().trim();

  if (isConsumerDomain(domain)) {
    return NextResponse.json(
      { error: "This is a personal email domain. Please use your company email domain." },
      { status: 422 },
    );
  }

  const result = await discoverEmailProvider(domain);
  return NextResponse.json(result);
}
