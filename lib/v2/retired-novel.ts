/**
 * Structured compatibility marker for the retired novel workflow.
 *
 * This intentionally never inspects titles or free-form content: a project
 * is retired only when an explicit workflow/content marker says "novel".
 */
export function isRetiredNovelRecord(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : null;
  return [
    record.workflowType,
    record.contentType,
    record.workType,
    record.workflow_type,
    record.content_type,
    record.work_type,
    record.mode,
    data?.workflowType,
    data?.contentType,
    data?.workType,
    data?.workflow_type,
    data?.content_type,
    data?.work_type,
    data?.mode,
  ].some((marker) => marker === "novel");
}
