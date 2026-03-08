import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie, isFirstRun } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  // Only allow registration if no users exist
  const firstRun = await isFirstRun();
  if (!firstRun) {
    return NextResponse.json({ error: "Operator already registered" }, { status: 409 });
  }

  const body = await req.json();
  const { displayName, email, password } = body;

  if (!displayName || !email || !password) {
    return NextResponse.json({ error: "displayName, email, and password are required" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  // Check if an Operator already exists (migration from Day 1 state)
  let operator = await prisma.operator.findFirst();
  if (!operator) {
    operator = await prisma.operator.create({
      data: { displayName, email, passwordHash },
    });
  }

  // Create the first User with admin role
  const user = await prisma.user.create({
    data: {
      operatorId: operator.id,
      email,
      displayName,
      passwordHash,
      role: "admin",
    },
  });

  const token = await createSession(operator.id, user.id);
  const cookieStore = await cookies();
  const cookieOpts = setSessionCookie(token);
  cookieStore.set(cookieOpts.name, cookieOpts.value, {
    httpOnly: cookieOpts.httpOnly,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    secure: cookieOpts.secure,
    maxAge: cookieOpts.maxAge,
  });

  // Seed foundational structure (best-effort)
  try {
    const { HARDCODED_TYPE_DEFS } = await import("@/lib/hardcoded-type-defs");

    // Ensure "organization" entity type
    let orgType = await prisma.entityType.findFirst({
      where: { operatorId: operator.id, slug: "organization" },
    });
    if (!orgType) {
      const def = HARDCODED_TYPE_DEFS["organization"];
      orgType = await prisma.entityType.create({
        data: {
          operatorId: operator.id,
          slug: def.slug,
          name: def.name,
          description: def.description,
          icon: def.icon,
          color: def.color,
          defaultCategory: def.defaultCategory,
        },
      });
    }

    // Ensure "department" entity type
    const deptType = await prisma.entityType.findFirst({
      where: { operatorId: operator.id, slug: "department" },
    });
    if (!deptType) {
      const def = HARDCODED_TYPE_DEFS["department"];
      await prisma.entityType.create({
        data: {
          operatorId: operator.id,
          slug: def.slug,
          name: def.name,
          description: def.description,
          icon: def.icon,
          color: def.color,
          defaultCategory: def.defaultCategory,
        },
      });
    }

    // Ensure "team-member" entity type
    const tmType = await prisma.entityType.findFirst({
      where: { operatorId: operator.id, slug: "team-member" },
    });
    if (!tmType) {
      const def = HARDCODED_TYPE_DEFS["team-member"];
      await prisma.entityType.create({
        data: {
          operatorId: operator.id,
          slug: def.slug,
          name: def.name,
          description: def.description,
          icon: def.icon,
          color: def.color,
          defaultCategory: def.defaultCategory,
          properties: {
            create: def.properties.map((p, i) => ({
              slug: p.slug,
              name: p.name,
              dataType: p.dataType,
              identityRole: p.identityRole ?? null,
              displayOrder: i,
            })),
          },
        },
      });
    }

    // Create CompanyHQ entity
    await prisma.entity.create({
      data: {
        operatorId: operator.id,
        entityTypeId: orgType.id,
        displayName: body.companyName || operator.displayName,
        category: "foundational",
        mapX: 0,
        mapY: 0,
        description: "Company headquarters",
      },
    });

    // Seed department-member relationship type
    const deptTypeForRel = await prisma.entityType.findFirst({
      where: { operatorId: operator.id, slug: "department" }
    });
    if (deptTypeForRel) {
      await prisma.relationshipType.upsert({
        where: { operatorId_slug: { operatorId: operator.id, slug: "department-member" } },
        create: {
          operatorId: operator.id,
          name: "Department Member",
          slug: "department-member",
          fromEntityTypeId: deptTypeForRel.id,
          toEntityTypeId: deptTypeForRel.id,
          description: "Links an entity to the department it belongs to",
        },
        update: {},
      });
    }
  } catch (seedErr) {
    console.error("[register] Failed to seed foundational structure:", seedErr);
  }

  return NextResponse.json({
    id: user.id,
    operatorId: operator.id,
    displayName,
    email,
    role: "admin",
  }, { status: 201 });
}
