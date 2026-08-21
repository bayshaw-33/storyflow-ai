const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Conversation thread IDs are UUID columns in Supabase. A short-lived V2.2
 * client shipped `kk-<work UUID>`; normalize that legacy shape before any
 * database request while keeping explicit valid thread UUIDs supported.
 */
export function normalizeScreenplayConversationId(
  workId: string,
  requested?: string | null,
): string | null {
  const work = workId.trim();
  if (!UUID_PATTERN.test(work)) return null;

  const value = requested?.trim() ?? "";
  if (!value) return work;
  if (UUID_PATTERN.test(value)) return value;
  if (value === `kk-${work}`) return work;
  return null;
}
