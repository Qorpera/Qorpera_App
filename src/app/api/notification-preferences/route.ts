import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NOTIFICATION_TYPES, getDefaultChannel } from "@/lib/notification-defaults";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: su.user.id },
  });

  const prefMap = new Map(prefs.map((p) => [p.notificationType, p.channel]));

  const merged = NOTIFICATION_TYPES.map((type) => {
    const explicit = prefMap.get(type);
    return {
      type,
      channel: explicit ?? getDefaultChannel(type),
      isDefault: !explicit,
    };
  });

  const user = await prisma.user.findUnique({
    where: { id: su.user.id },
    select: { digestEnabled: true },
  });

  return NextResponse.json({ preferences: merged, digestEnabled: user?.digestEnabled ?? false });
}

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { preferences, digestEnabled } = body as {
    preferences?: Array<{ type: string; channel: string }>;
    digestEnabled?: boolean;
  };

  const validChannels = ["in_app", "email", "both", "none"];

  // Validate preferences array if provided
  if (preferences !== undefined) {
    if (!Array.isArray(preferences)) {
      return NextResponse.json({ error: "preferences must be an array" }, { status: 400 });
    }
    for (const p of preferences) {
      if (!p.type || !p.channel) {
        return NextResponse.json({ error: "Each preference must have type and channel" }, { status: 400 });
      }
      if (!(NOTIFICATION_TYPES as readonly string[]).includes(p.type)) {
        return NextResponse.json({ error: `Invalid notification type: ${p.type}` }, { status: 400 });
      }
      if (!validChannels.includes(p.channel)) {
        return NextResponse.json({ error: `channel must be one of: ${validChannels.join(", ")}` }, { status: 400 });
      }
    }
  }

  // Upsert each preference
  if (preferences && preferences.length > 0) {
    await Promise.all(
      preferences.map((p) =>
        prisma.notificationPreference.upsert({
          where: { userId_notificationType: { userId: su.user.id, notificationType: p.type } },
          create: { userId: su.user.id, notificationType: p.type, channel: p.channel },
          update: { channel: p.channel },
        })
      )
    );
  }

  // Update digestEnabled on user if provided
  if (digestEnabled !== undefined) {
    await prisma.user.update({
      where: { id: su.user.id },
      data: { digestEnabled: !!digestEnabled },
    });
  }

  // Return updated state
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: su.user.id },
  });
  const prefMap = new Map(prefs.map((p) => [p.notificationType, p.channel]));
  const merged = NOTIFICATION_TYPES.map((type) => {
    const explicit = prefMap.get(type);
    return {
      type,
      channel: explicit ?? getDefaultChannel(type),
      isDefault: !explicit,
    };
  });

  const user = await prisma.user.findUnique({
    where: { id: su.user.id },
    select: { digestEnabled: true },
  });

  return NextResponse.json({ preferences: merged, digestEnabled: user?.digestEnabled ?? false });
}
