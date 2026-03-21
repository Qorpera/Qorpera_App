import { prisma } from "@/lib/db";

/**
 * Get app settings for an operator.
 * Checks operator-specific overrides first, falls back to global settings (operatorId = null).
 * Returns a key→value map.
 */
export async function getOperatorSettings(
  operatorId: string,
  keys: string[],
): Promise<Map<string, string>> {
  // Fetch both global and operator-specific settings in one query
  const settings = await prisma.appSetting.findMany({
    where: {
      key: { in: keys },
      OR: [
        { operatorId: null },
        { operatorId },
      ],
    },
  });

  // Build map: operator-specific overrides global
  const map = new Map<string, string>();
  for (const s of settings) {
    if (s.operatorId === null) {
      // Global — set if not already overridden by operator-specific
      if (!map.has(s.key)) {
        map.set(s.key, s.value);
      }
    }
  }
  // Second pass: operator-specific overrides
  for (const s of settings) {
    if (s.operatorId === operatorId) {
      map.set(s.key, s.value);
    }
  }

  return map;
}

/**
 * Get a single setting value for an operator, with optional default.
 */
export async function getOperatorSetting(
  operatorId: string,
  key: string,
  defaultValue?: string,
): Promise<string | undefined> {
  const map = await getOperatorSettings(operatorId, [key]);
  return map.get(key) ?? defaultValue;
}
