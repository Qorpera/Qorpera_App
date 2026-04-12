import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import crypto from "crypto";

const InviteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["member", "admin"]).default("member"),
  // Wiki-first fields
  name: z.string().min(1),
  domainPageSlug: z.string().optional(),
  // Deprecated but accepted for backward compat
  entityId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 });
  }

  // Billing gate: free users cannot invite team members
  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { billingStatus: true },
  });
  if (operator) {
    const { checkBillingGate } = await import("@/lib/billing-gate");
    const gate = checkBillingGate(operator);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason, code: gate.code }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  const { name, email, password, role, domainPageSlug, entityId } = parsed.data;
  const operatorId = su.operatorId;

  // Check email uniqueness
  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Find or create a person_profile wiki page
  let wikiPageSlug: string | null = null;
  const existingPage = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      scope: "operator",
      pageType: "person_profile",
      OR: [
        { content: { contains: email, mode: "insensitive" } },
        { title: { equals: name, mode: "insensitive" } },
      ],
    },
    select: { slug: true },
  });

  if (existingPage) {
    wikiPageSlug = existingPage.slug;
  } else {
    const slug = `person-${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    const now = new Date();
    await prisma.knowledgePage.create({
      data: {
        operatorId,
        slug,
        title: name,
        pageType: "person_profile",
        scope: "operator",
        status: "draft",
        content: `## ${name}\n\nEmail: ${email}\nRole: ${role}${domainPageSlug ? `\n\nDepartment: [[${domainPageSlug}]]` : ""}`,
        crossReferences: domainPageSlug ? [domainPageSlug] : [],
        synthesisPath: "manual",
        synthesizedByModel: "manual",
        confidence: 0.5,
        contentTokens: 0,
        lastSynthesizedAt: now,
      },
    });
    wikiPageSlug = slug;
  }

  // Check for existing user with this wiki page
  const existingUser = await prisma.user.findFirst({
    where: { operatorId, wikiPageSlug },
  });
  if (existingUser) {
    return NextResponse.json({ error: "This person already has a user account" }, { status: 409 });
  }

  // Check for pending invite
  const pendingInvite = await prisma.invite.findFirst({
    where: { operatorId, wikiPageSlug, claimedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pendingInvite) {
    return NextResponse.json({ error: "An invite is already pending for this person" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const invite = await prisma.invite.create({
    data: {
      operatorId,
      email,
      name,
      role,
      wikiPageSlug,
      entityId: entityId ?? null,
      passwordHash,
      token,
      expiresAt,
      createdById: su.user.id,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const link = `${baseUrl}/invite/${token}`;

  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      personName: name,
      link,
      expiresAt: invite.expiresAt,
    },
  }, { status: 201 });
}

export async function GET() {
  // Alias for /api/users/invites — list pending invites
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.invite.findMany({
    where: { operatorId: su.operatorId, claimedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  // Resolve wiki page titles
  const slugs = invites.map(i => i.wikiPageSlug).filter(Boolean) as string[];
  const pageMap = new Map<string, string>();
  if (slugs.length > 0) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId: su.operatorId, slug: { in: slugs }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const p of pages) pageMap.set(p.slug, p.title);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return NextResponse.json(
    invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      personName: inv.wikiPageSlug ? pageMap.get(inv.wikiPageSlug) ?? inv.name ?? null : inv.name ?? null,
      wikiPageSlug: inv.wikiPageSlug,
      link: `${baseUrl}/invite/${inv.token}`,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }))
  );
}
