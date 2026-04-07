import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listEntities, createEntity } from "@/lib/entity-model-store";
import { getVisibleDomainIds, domainScopeFilter } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  const url = new URL(req.url);
  const typeSlug = url.searchParams.get("type") ?? undefined;
  const search = url.searchParams.get("q") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const result = await listEntities(operatorId, { typeSlug, search, status, limit, offset, scopeFilter: domainScopeFilter(visibleDomains) });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const body = await req.json();
  const entity = await createEntity(operatorId, body);
  return NextResponse.json(entity, { status: 201 });
}
