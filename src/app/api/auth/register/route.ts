import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { z } from "zod";

const RegisterSchema = z.object({
  companyName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  industry: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (process.env.REGISTRATION_ENABLED !== "true") {
    return NextResponse.json({ error: "Registration is currently closed" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  const { companyName, name, email, password, industry } = parsed.data;

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // Transaction: create operator, user, seed structure
  const result = await prisma.$transaction(async (tx) => {
    // Create Operator
    const operator = await tx.operator.create({
      data: { displayName: companyName, companyName, industry: industry || null },
    });

    // Seed foundational entity types
    const { HARDCODED_TYPE_DEFS } = await import("@/lib/hardcoded-type-defs");

    // Organization type
    const orgDef = HARDCODED_TYPE_DEFS["organization"];
    const orgType = await tx.entityType.create({
      data: {
        operatorId: operator.id,
        slug: orgDef.slug,
        name: orgDef.name,
        description: orgDef.description,
        icon: orgDef.icon,
        color: orgDef.color,
        defaultCategory: orgDef.defaultCategory,
      },
    });

    // Department type
    const deptDef = HARDCODED_TYPE_DEFS["department"];
    const deptType = await tx.entityType.create({
      data: {
        operatorId: operator.id,
        slug: deptDef.slug,
        name: deptDef.name,
        description: deptDef.description,
        icon: deptDef.icon,
        color: deptDef.color,
        defaultCategory: deptDef.defaultCategory,
      },
    });

    // Team-member type with properties
    const tmDef = HARDCODED_TYPE_DEFS["team-member"];
    await tx.entityType.create({
      data: {
        operatorId: operator.id,
        slug: tmDef.slug,
        name: tmDef.name,
        description: tmDef.description,
        icon: tmDef.icon,
        color: tmDef.color,
        defaultCategory: tmDef.defaultCategory,
        properties: {
          create: tmDef.properties.map((p: { slug: string; name: string; dataType: string; identityRole?: string }, i: number) => ({
            slug: p.slug,
            name: p.name,
            dataType: p.dataType,
            identityRole: p.identityRole ?? null,
            displayOrder: i,
          })),
        },
      },
    });

    // CompanyHQ entity
    await tx.entity.create({
      data: {
        operatorId: operator.id,
        entityTypeId: orgType.id,
        displayName: companyName,
        category: "foundational",
        mapX: 0,
        mapY: 0,
        description: "Company headquarters",
      },
    });

    // Create User (admin)
    const user = await tx.user.create({
      data: {
        operatorId: operator.id,
        email,
        name,
        passwordHash,
        role: "admin",
      },
    });

    // OrientationSession
    await tx.orientationSession.create({
      data: { operatorId: operator.id, phase: "mapping" },
    });

    // Department-member relationship type
    await tx.relationshipType.create({
      data: {
        operatorId: operator.id,
        name: "Department Member",
        slug: "department-member",
        fromEntityTypeId: deptType.id,
        toEntityTypeId: deptType.id,
        description: "Links an entity to the department it belongs to",
      },
    });

    return { user, operator };
  });

  // Create Stripe customer (outside transaction — registration succeeds even if Stripe fails)
  try {
    const { stripe, isStripeEnabled } = await import("@/lib/stripe");
    if (isStripeEnabled()) {
      const customer = await stripe!.customers.create({
        email: result.user.email,
        name: result.operator.companyName || result.operator.displayName,
        metadata: { operatorId: result.operator.id, userId: result.user.id },
      });
      await prisma.operator.update({
        where: { id: result.operator.id },
        data: { stripeCustomerId: customer.id },
      });
    }
  } catch (err) {
    console.warn("[register] Stripe customer creation failed (will retry on billing activation):", err);
  }

  // Create session + set cookie
  const { token, expiresAt } = await createSession(result.user.id);
  await setSessionCookie(token, expiresAt);

  return NextResponse.json({
    user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role },
    operator: { id: result.operator.id, companyName: result.operator.companyName },
  }, { status: 201 });
}
