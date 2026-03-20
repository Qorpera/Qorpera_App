/**
 * Shared JSON extraction helpers for parsing LLM responses.
 * LLM responses often wrap JSON in markdown fences (```json ... ```).
 * These helpers strip fences and parse safely.
 */

/** Extract a JSON object from text that may contain markdown fences. Returns null on failure. */
export function extractJSON(text: string): Record<string, unknown> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Extract any JSON value (object, array, or primitive) from text with markdown fences. */
export function extractJSONAny(text: string): unknown | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/** Extract a JSON array from text with markdown fences. Wraps single objects in an array. */
export function extractJSONArray(text: string): Array<Record<string, unknown>> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}
