import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getValidStripeToken } from "@/lib/connectors/stripe-auth";
import { materializeEvent } from "@/lib/event-materializer";
import { checkForSituationResolution } from "@/lib/situation-resolver";
import { decrypt, encrypt } from "@/lib/encryption";

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

  // Look up the connector
  const connector = await prisma.sourceConnector.findUnique({
    where: { id: connectorId },
  });

  if (!connector || connector.provider !== "stripe") {
    return NextResponse.json({ error: "Unknown connector" }, { status: 404 });
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
  const config = connector.config ? JSON.parse(decrypt(connector.config)) : {};
  const originalToken = config.access_token;
  let verifiedEvent: any;
  try {
    const token = await getValidStripeToken(config);

    // Persist refreshed tokens if they changed
    if (config.access_token !== originalToken) {
      await prisma.sourceConnector.update({
        where: { id: connectorId },
        data: { config: encrypt(JSON.stringify(config)) },
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
