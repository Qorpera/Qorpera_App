import { prisma } from "@/lib/db";
import { sendNotification } from "@/lib/notification-dispatch";
import { getProvider } from "@/lib/connectors/registry";
import { decryptConfig } from "@/lib/config-encryption";
import type { StepOutput } from "@/lib/types/execution";

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
    const situationId = `meeting-${Date.now()}-${inviteeUserId.slice(0, 8)}`;
    const slug = `sit-meeting-${Date.now()}-${inviteeUserId.slice(0, 8)}`;

    const page = await prisma.knowledgePage.create({
      data: {
        operatorId,
        slug,
        title: `Meeting request: ${topic}`,
        pageType: "situation_instance",
        scope: "operator",
        content: `Meeting requested by ${organizer?.name || "colleague"}.\n\nAgenda: ${agenda}`,
        status: "draft",
        confidence: 0.8,
        synthesisPath: "reasoning",
        synthesizedByModel: "system",
        lastSynthesizedAt: new Date(),
        properties: {
          situation_id: situationId,
          situation_type_id: situationType.id,
          source: "detected",
          status: "detected",
          context: {
            suggestedTimes,
            agenda,
            topic,
            organizerUserId,
            allParticipantUserIds: participantUserIds,
            round: 1,
          },
          assigned_user_id: inviteeUserId,
        },
      },
    });

    situationIds.push(page.id);

    await sendNotification({
      operatorId,
      userId: inviteeUserId,
      type: "situation_proposed",
      title: `Meeting request: ${topic}`,
      body: `${organizer?.name || "A colleague"} would like to meet about: ${agenda}`,
      sourceType: "situation",
      sourceId: page.id,
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
  const situationPage = await prisma.knowledgePage.findFirst({
    where: {
      pageType: "situation_instance",
      scope: "operator",
      properties: { path: ["situation_id"], equals: situationId },
    },
    select: { id: true, operatorId: true, properties: true },
  });
  if (!situationPage) throw new Error("Situation not found");

  const props = (situationPage.properties ?? {}) as Record<string, unknown>;
  const metadata = (props.context ?? {}) as Record<string, unknown>;

  switch (decision) {
    case "accepted": {
      const acceptedProps = {
        ...props,
        status: "resolved",
        resolved_at: new Date().toISOString(),
        context: {
          ...metadata,
          decision: "accepted",
          acceptedTime: resolutionData.acceptedTime || (metadata.suggestedTimes as unknown[])?.[0],
        },
      };
      await prisma.knowledgePage.update({
        where: { id: situationPage.id },
        data: { properties: acceptedProps as object },
      });
      return { resolved: true };
    }

    case "declined": {
      const declinedProps = {
        ...props,
        status: "resolved",
        resolved_at: new Date().toISOString(),
        context: {
          ...metadata,
          decision: "declined",
          reason: resolutionData.reason || undefined,
        },
      };
      await prisma.knowledgePage.update({
        where: { id: situationPage.id },
        data: { properties: declinedProps as object },
      });
      return { resolved: true };
    }

    case "counter_proposal": {
      const currentRound = (metadata.round as number) || 1;

      if (currentRound >= MAX_COUNTER_ROUNDS) {
        // Auto-resolve with needs_manual_coordination
        const maxRoundProps = {
          ...props,
          status: "resolved",
          resolved_at: new Date().toISOString(),
          context: {
            ...metadata,
            decision: "needs_manual_coordination",
            reason: `Maximum ${MAX_COUNTER_ROUNDS} rounds of counter-proposals reached`,
          },
        };
        await prisma.knowledgePage.update({
          where: { id: situationPage.id },
          data: { properties: maxRoundProps as object },
        });
        return { resolved: true, action: "fallback_to_human" };
      }

      // Update round count on original situation
      const counterProps = {
        ...props,
        context: {
          ...metadata,
          round: currentRound + 1,
          lastCounterProposal: resolutionData.proposedTimes,
        },
      };
      await prisma.knowledgePage.update({
        where: { id: situationPage.id },
        data: { properties: counterProps as object },
      });

      // Create counter-proposal situation for the organizer
      const organizerUserId = metadata.organizerUserId as string | undefined;
      if (organizerUserId) {
        const counterSlug = `sit-meeting-counter-${Date.now()}-${organizerUserId.slice(0, 8)}`;
        const counterProperties = {
          situation_id: `meeting-counter-${Date.now()}-${organizerUserId.slice(0, 8)}`,
          situation_type_id: props.situation_type_id as string,
          source: "detected",
          status: "detected",
          assigned_user_id: organizerUserId,
          context: {
            ...metadata,
            suggestedTimes: resolutionData.proposedTimes,
            round: currentRound + 1,
            counterProposalFrom: props.assigned_user_id as string,
            originalSituationId: situationId,
          },
        };
        const counterPage = await prisma.knowledgePage.create({
          data: {
            operatorId: situationPage.operatorId,
            slug: counterSlug,
            title: `Counter-proposal for: ${(metadata.topic as string) || "Meeting"}`,
            pageType: "situation_instance",
            scope: "operator",
            content: `Counter-proposal round ${currentRound + 1}.`,
            status: "draft",
            confidence: 0.8,
            synthesisPath: "reasoning",
            synthesizedByModel: "system",
            lastSynthesizedAt: new Date(),
            properties: counterProperties as object,
          },
        });

        await sendNotification({
          operatorId: situationPage.operatorId!,
          userId: organizerUserId,
          type: "situation_proposed",
          title: `Counter-proposal for: ${(metadata.topic as string) || "Meeting"}`,
          body: `Alternative times proposed. Round ${currentRound + 1} of ${MAX_COUNTER_ROUNDS}.`,
          sourceType: "situation",
          sourceId: counterPage.id,
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
        deletedAt: null,
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
      const config = decryptConfig(connector.config || "{}") as Record<string, any>;
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
    where: { operatorId, provider: { in: ["google", "microsoft"] }, status: "active", deletedAt: null },
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
