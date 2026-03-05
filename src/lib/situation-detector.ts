/**
 * Called by the materializer after entities are created/updated.
 * Checks all enabled SituationTypes against the affected entities.
 *
 * Stub for Day 1 -- logs the call and returns. Full implementation on Day 5.
 */
export async function notifySituationDetectors(
  operatorId: string,
  entityIds: string[],
  triggerEventId?: string
): Promise<void> {
  if (entityIds.length === 0) return;

  console.log(
    `[situation-detector] Stub: ${entityIds.length} entities updated, ` +
    `trigger event: ${triggerEventId ?? "none"}. ` +
    `Full detection logic not yet implemented.`
  );
}
