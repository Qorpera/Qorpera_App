import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getValidStripeToken } from "@/lib/connectors/stripe-auth";
import { materializeEvent } from "@/lib/event-materializer";
import { checkForSituationResolution } from "@/lib/situation-resolver";
import { decryptConfig, encryptConfig } from "@/lib/config-encryption";
import { checkRateLimit } from "@/lib/rate-limiter";

// Webhooks are intentionally unauthenticated by session — they come from external
// services (Stripe, etc.) without user sessions. Authenticity is verified by
// fetching the event back from the provider's API using the connector's stored
// credentials. Connector must exist and be active to accept webhooks.

const STRIPE_EVENT_MAP: Record<string, string> = {
  "invoice.payment_succeeded": "invoice.paid",
  "invoice.overdue": "invoice.overdue",
  "invoice.past_due": "invoice.overdue",
  "customer.created": "customer.synced",
  "customer.updated": "customer.synced",
  "invoice.created": "invoice.created",
};

const RESOLUTION_EVENT_TYPES = new Set(["invoice.paid", "payment.received"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  // Rate limit per connector to prevent abuse
  const { allowed } = checkRateLimit(`webhook:${connectorId}`, 100, 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Look up the connector — must exist and be active
  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, deletedAt: null },
  });

  if (!connector || connector.provider !== "stripe") {
    return NextResponse.json({ error: "Unknown connector" }, { status: 404 });
  }

  if (connector.status !== "active" && connector.status !== "syncing") {
    return NextResponse.json({ error: "Connector is not active" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stripeEventId = body.id;
  const stripeEventType = body.type;

  if (!stripeEventId || !stripeEventType) {
    return NextResponse.json({ error: "Missing event data" }, { status: 400 });
  }

  // Verify authenticity by fetching the event from Stripe's API
  const config = (connector.config ? decryptConfig(connector.config) : {}) as Record<string, any>;
  const originalToken = config.access_token;
  let verifiedEvent: any;
  try {
    const token = await getValidStripeToken(config);

    // Persist refreshed tokens if they changed
    if (config.access_token !== originalToken) {
      await prisma.sourceConnector.update({
        where: { id: connectorId },
        data: { config: encryptConfig(config as Record<string, unknown>) },
      });
    }

    const resp = await fetch(`https://api.stripe.com/v1/events/${stripeEventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: "Event verification failed" },
        { status: 400 }
      );
    }

    verifiedEvent = await resp.json();
  } catch (err) {
    console.error("[webhook] Stripe verification error:", err);
    return NextResponse.json(
      { error: "Event verification failed" },
      { status: 400 }
    );
  }

  // Deduplicate: check if we already have this event
  const existing = await prisma.event.findFirst({
    where: {
      connectorId,
      source: "stripe",
      payload: { contains: stripeEventId },
    },
  });

  if (existing) {
    return NextResponse.json({ received: true });
  }

  // Map to Qorpera event type
  const mappedEventType = STRIPE_EVENT_MAP[stripeEventType];
  const eventPayload = verifiedEvent.data?.object || body.data?.object || {};

  // Store the Stripe event ID in the payload for dedup
  eventPayload._stripe_event_id = stripeEventId;

  const event = await prisma.event.create({
    data: {
      operatorId: connector.operatorId,
      connectorId,
      source: "stripe",
      eventType: mappedEventType || stripeEventType,
      payload: JSON.stringify(eventPayload),
    },
  });

  // Materialize the event
  const result = await materializeEvent(connector.operatorId, {
    id: event.id,
    connectorId,
    source: "stripe",
    eventType: event.eventType,
    payload: event.payload,
    processedAt: null,
    materializationError: null,
  });

  // Check for situation resolution
  if (
    RESOLUTION_EVENT_TYPES.has(event.eventType) &&
    result.entityIds?.length
  ) {
    checkForSituationResolution(
      connector.operatorId,
      event.eventType,
      result.entityIds,
      event.id
    ).catch((err) =>
      console.error("[webhook] Situation resolution error:", err)
    );
  }

  return NextResponse.json({ received: true });
}
