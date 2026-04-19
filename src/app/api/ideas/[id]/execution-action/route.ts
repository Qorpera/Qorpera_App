import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updatePageWithLock } from "@/lib/wiki-engine";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { skipDownstreamAndImplement } from "@/lib/idea-execution";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

const ALLOWED = new Set(["retry", "skip_downstream", "abandon"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const action = body.action as string | undefined;
  if (!action || !ALLOWED.has(action)) {
    return NextResponse.json({ error: `action must be one of: ${[...ALLOWED].join(", ")}` }, { status: 400 });
  }

  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: id, pageType: "idea", scope: "operator" },
    select: { slug: true, title: true, properties: true },
  });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const props = (page.properties ?? {}) as Record<string, unknown>;
  if (props.status !== "concerns_raised") {
    return NextResponse.json(
      { error: `Can only run execution actions on concerns_raised ideas (current: ${props.status})` },
      { status: 409 }
    );
  }

  try {
    if (action === "retry") {
      await enqueueWorkerJob("execute_idea", operatorId, {
        operatorId,
        pageSlug: page.slug,
      });
      return NextResponse.json({ id: page.slug, action: "retry", message: "Execution re-enqueued" });
    }

    if (action === "skip_downstream") {
      await skipDownstreamAndImplement(operatorId, page.slug);
      return NextResponse.json({ id: page.slug, action: "skip_downstream", status: "implemented" });
    }

    if (action === "abandon") {
      await updatePageWithLock(operatorId, page.slug, (p) => ({
        properties: {
          ...(p.properties ?? {}),
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejected_after_execution: true,
          abandoned_by: user.id,
        },
      }));

      sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: `Idea abandoned: ${page.title.slice(0, 80)}`,
        body: "The user abandoned this idea after execution concerns.",
        sourceType: "wiki_page",
        sourceId: page.slug,
      }).catch(() => {});

      return NextResponse.json({ id: page.slug, action: "abandon", status: "rejected" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(`[execution-action] ${action} failed for ${id}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
