import { prisma } from "@/lib/db";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { getProvider } from "@/lib/connectors/registry";
import { decrypt } from "@/lib/encryption";
import type { StepOutput } from "@/lib/execution-engine";

const MAX_COUNTER_ROUNDS = 3;

// ── Request Meeting (internal capability handler) ────────────────────────────

export async function handleRequestMeeting(
  params: Record<string, unknown>,
  operatorId: string,
): Promise<StepOutput> {
  const participantUserIds = params.participantUserIds as string[];
  const suggestedTimes = params.suggestedTimes as Array<{ start: string; end: string }>;
  const agenda = String(params.agenda || "");
  const topic = String(params.topic || "");

  if (!participantUserIds?.length || !suggestedTimes?.length) {
    throw new Error("request_meeting requires participantUserIds and suggestedTimes");
  }

  // Resolve meeting_request situation type
  const situationType = await prisma.situationType.findFirst({
    where: { operatorId, slug: "meeting_request" },
  });
  if (!situationType) {
    throw new Error("meeting_request SituationType not found. Run the bootstrap script.");
  }

  // Determine organizer (first participant) and invitees (rest)
  const organizerUserId = participantUserIds[0];
  const inviteeUserIds = participantUserIds.slice(1);

  const organizer = await prisma.user.findUnique({
    where: { id: organizerUserId },
    select: { name: true },
  });

  const situationIds: string[] = [];

  for (const inviteeUserId of inviteeUserIds) {
    const situation = await prisma.situation.create({
      data: {
        operatorId,
        situationTypeId: situationType.id,
        source: "detected",
        status: "detected",
        contextSnapshot: JSON.stringify({
          suggestedTimes,
          agenda,
          topic,
          organizerUserId,
          allParticipantUserIds: participantUserIds,
          round: 1,
        }),
        assignedUserId: inviteeUserId,
      },
    });

    situationIds.push(situation.id);

    await sendNotification({
      operatorId,
      userId: inviteeUserId,
      type: "situation_proposed",
      title: `Meeting request: ${topic}`,
      body: `${organizer?.name || "A colleague"} would like to meet about: ${agenda}`,
      sourceType: "situation",
      sourceId: situation.id,
    });
  }

  return {
    type: "data",
    payload: { situationIds, topic, participantCount: participantUserIds.length },
    description: `Meeting requested: ${topic} (${inviteeUserIds.length} invitees)`,
  };
}

// ── Meeting Request Resolution Handler ──────────────────────────────────────

export async function handleMeetingRequestResolution(
  situationId: string,
  decision: string,
  resolutionData: Record<string, unknown>,
): Promise<{ resolved: boolean; action?: string }> {
  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    select: { id: true, operatorId: true, spawningStepId: true, contextSnapshot: true, assignedUserId: true, situationTypeId: true },
  });
  if (!situation) throw new Error("Situation not found");

  const metadata = situation.contextSnapshot ? JSON.parse(situation.contextSnapshot) : {};

  switch (decision) {
    case "accepted": {
      await prisma.situation.update({
        where: { id: situationId },
        data: {
          status: "resolved",
          resolvedAt: new Date(),
          contextSnapshot: JSON.stringify({
            ...metadata,
            decision: "accepted",
            acceptedTime: resolutionData.acceptedTime || metadata.suggestedTimes?.[0],
          }),
        },
      });
      return { resolved: true };
    }

    case "declined": {
      await prisma.situation.update({
        where: { id: situationId },
        data: {
          status: "resolved",
          resolvedAt: new Date(),
          contextSnapshot: JSON.stringify({
            ...metadata,
            decision: "declined",
            reason: resolutionData.reason || undefined,
          }),
        },
      });
      return { resolved: true };
    }

    case "counter_proposal": {
      const currentRound = metadata.round || 1;

      if (currentRound >= MAX_COUNTER_ROUNDS) {
        // Auto-resolve with needs_manual_coordination
        await prisma.situation.update({
          where: { id: situationId },
          data: {
            status: "resolved",
            resolvedAt: new Date(),
            contextSnapshot: JSON.stringify({
              ...metadata,
              decision: "needs_manual_coordination",
              reason: `Maximum ${MAX_COUNTER_ROUNDS} rounds of counter-proposals reached`,
            }),
          },
        });
        return { resolved: true, action: "fallback_to_human" };
      }

      // Update round count on original situation
      await prisma.situation.update({
        where: { id: situationId },
        data: {
          contextSnapshot: JSON.stringify({
            ...metadata,
            round: currentRound + 1,
            lastCounterProposal: resolutionData.proposedTimes,
          }),
        },
      });

      // Create counter-proposal situation for the organizer
      const organizerUserId = metadata.organizerUserId;
      if (organizerUserId) {
        await prisma.situation.create({
          data: {
            operatorId: situation.operatorId,
            situationTypeId: situation.situationTypeId,
            spawningStepId: situation.spawningStepId,
            source: "detected",
            status: "detected",
            assignedUserId: organizerUserId,
            contextSnapshot: JSON.stringify({
              ...metadata,
              suggestedTimes: resolutionData.proposedTimes,
              round: currentRound + 1,
              counterProposalFrom: situation.assignedUserId,
              originalSituationId: situationId,
            }),
          },
        });

        await sendNotification({
          operatorId: situation.operatorId,
          userId: organizerUserId,
          type: "situation_proposed",
          title: `Counter-proposal for: ${metadata.topic || "Meeting"}`,
          body: `Alternative times proposed. Round ${currentRound + 1} of ${MAX_COUNTER_ROUNDS}.`,
          sourceType: "situation",
          sourceId: situationId,
        });
      }

      return { resolved: false }; // Situation stays open
    }

    default:
      throw new Error(`Unknown meeting decision: ${decision}`);
  }
}

// ── Calendar Event Creation on Full Acceptance ──────────────────────────────

export async function createCalendarEventsForMeeting(
  operatorId: string,
  participantUserIds: string[],
  acceptedTime: { start: string; end: string },
  meetingDetails: { topic: string; agenda: string },
): Promise<{ created: string[]; notified: string[] }> {
  const created: string[] = [];
  const notified: string[] = [];

  // Resolve all participant emails for attendee list
  const participants = await prisma.user.findMany({
    where: { id: { in: participantUserIds }, operatorId },
    select: { id: true, email: true },
  });
  const attendeeEmails = participants.map(p => p.email);

  for (const participant of participants) {
    // Find their calendar connector (Google or Microsoft)
    const connector = await prisma.sourceConnector.findFirst({
      where: {
        operatorId,
        userId: participant.id,
        provider: { in: ["google", "microsoft"] },
        status: "active",
      },
    });

    if (!connector) {
      // No calendar connector — send notification instead
      await sendNotification({
        operatorId,
        userId: participant.id,
        type: "system_alert",
        title: `Meeting scheduled: ${meetingDetails.topic}`,
        body: `${meetingDetails.agenda}\nTime: ${acceptedTime.start} - ${acceptedTime.end}`,
        sourceType: "system",
        sourceId: participant.id,
      });
      notified.push(participant.id);
      continue;
    }

    // Check if create_calendar_event capability is enabled
    const capability = await prisma.actionCapability.findFirst({
      where: {
        operatorId,
        connectorId: connector.id,
        slug: "create_calendar_event",
        writeBackStatus: "enabled",
      },
    });

    if (!capability) {
      // Write-back not enabled — send notification instead
      await sendNotification({
        operatorId,
        userId: participant.id,
        type: "system_alert",
        title: `Meeting scheduled: ${meetingDetails.topic}`,
        body: `${meetingDetails.agenda}\nTime: ${acceptedTime.start} - ${acceptedTime.end}\n(Calendar write-back not enabled — add event manually)`,
        sourceType: "system",
        sourceId: participant.id,
      });
      notified.push(participant.id);
      continue;
    }

    // Execute calendar event creation
    const provider = getProvider(connector.provider);
    if (!provider?.executeAction) {
      notified.push(participant.id);
      continue;
    }

    try {
      const config = JSON.parse(decrypt(connector.config || "{}"));
      const result = await provider.executeAction(config, "create_calendar_event", {
        summary: meetingDetails.topic,
        description: meetingDetails.agenda,
        startDateTime: acceptedTime.start,
        endDateTime: acceptedTime.end,
        attendeeEmails,
      });

      if (result.success) {
        created.push(participant.id);
      } else {
        notified.push(participant.id);
      }
    } catch {
      notified.push(participant.id);
    }
  }

  return { created, notified };
}

// ── Backfill + Seeding ──────────────────────────────────────────────────────

export async function backfillCalendarWriteCapabilities(operatorId: string): Promise<number> {
  let count = 0;
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId, provider: { in: ["google", "microsoft"] }, status: "active" },
  });

  for (const connector of connectors) {
    const provider = getProvider(connector.provider);
    if (!provider?.writeCapabilities) continue;

    const calendarCaps = provider.writeCapabilities.filter(
      c => c.slug === "create_calendar_event" || c.slug === "update_calendar_event",
    );

    for (const cap of calendarCaps) {
      const existing = await prisma.actionCapability.findFirst({
        where: { operatorId, connectorId: connector.id, slug: cap.slug },
      });
      if (!existing) {
        await prisma.actionCapability.create({
          data: {
            operatorId,
            connectorId: connector.id,
            slug: cap.slug,
            name: cap.name,
            description: cap.description,
            inputSchema: JSON.stringify(cap.inputSchema),
            writeBackStatus: "pending",
          },
        });
        count++;
      }
    }
  }

  return count;
}

export async function seedMeetingRequestSituationType(operatorId: string): Promise<void> {
  const existing = await prisma.situationType.findFirst({
    where: { operatorId, slug: "meeting_request" },
  });
  if (existing) return;

  await prisma.situationType.create({
    data: {
      operatorId,
      slug: "meeting_request",
      name: "Meeting Request",
      description: "A meeting has been requested. Review the proposed time and accept, decline, or suggest an alternative.",
      detectionLogic: JSON.stringify({ mode: "content" }), // Not detected by cron — created by execution engine
      autonomyLevel: "supervised",
    },
  });
}

export async function seedRequestMeetingCapability(operatorId: string): Promise<void> {
  const existing = await prisma.actionCapability.findFirst({
    where: { operatorId, name: "request_meeting", connectorId: null },
  });
  if (existing) return;

  await prisma.actionCapability.create({
    data: {
      operatorId,
      connectorId: null,
      slug: "request_meeting",
      name: "request_meeting",
      description: "Request a meeting with company members",
      inputSchema: JSON.stringify({
        participantUserIds: { type: "array" },
        suggestedTimes: { type: "array" },
        agenda: { type: "string" },
        topic: { type: "string" },
      }),
      writeBackStatus: "enabled",
      enabled: true,
    },
  });
}
