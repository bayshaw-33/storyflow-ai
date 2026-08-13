import type { EvidenceEventType } from "@/lib/contracts/v2";

export type EvidenceFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
export class EvidenceError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "validation_failed" | "service_unavailable";
  constructor(code: EvidenceError["code"], message: string) { super(`${code}: ${message}`); this.name = "EvidenceError"; this.code = code; }
}
const EVENT_TYPES: EvidenceEventType[] = ["generation_completed", "asset_confirmed", "asset_published", "license_granted", "export_released"];
const SUBJECT_TYPES = ["project", "universe", "asset", "asset_version", "usage_grant"] as const;
type EventRow = { id: string; event_type: EvidenceEventType; subject_type: (typeof SUBJECT_TYPES)[number]; subject_id: string; asset_id?: string | null; project_id?: string | null; usage_grant_id?: string | null; order_id?: string | null; actor_id?: string | null; occurred_at: string; summary?: string | null; facts?: Record<string, unknown> | null; created_at?: string };

export interface CreateEvidenceEventInput { eventType: EvidenceEventType; subjectType: (typeof SUBJECT_TYPES)[number]; subjectId: string; assetId?: string; projectId?: string; usageGrantId?: string; orderId?: string; occurredAt?: string; summary?: string; facts?: Record<string, unknown> }
export const EVIDENCE_DISCLAIMER = "Evidence records facts for verification and do not constitute legal determinations.";

export async function createEvidenceEvent(params: { fetcher: EvidenceFetcher; userId: string; input: CreateEvidenceEventInput }) {
  assertUser(params.userId); validateInput(params.input);
  const rows = await query<EventRow[]>(params.fetcher, "/rest/v1/storyflow_v2_evidence_events", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ event_type: params.input.eventType, subject_type: params.input.subjectType, subject_id: params.input.subjectId, asset_id: params.input.assetId || null, project_id: params.input.projectId || null, usage_grant_id: params.input.usageGrantId || null, order_id: params.input.orderId || null, actor_id: params.userId, occurred_at: params.input.occurredAt || new Date().toISOString(), summary: params.input.summary || null, facts: params.input.facts || {} }) });
  const row = rows?.[0]; if (!row) throw new EvidenceError("service_unavailable", "Unable to record evidence event.");
  return { event: toEvent(row), disclaimer: EVIDENCE_DISCLAIMER };
}

export async function listEvidenceEvents(params: { fetcher: EvidenceFetcher; userId: string; filters: { assetId?: string | null; projectId?: string | null; from?: string | null; to?: string | null } }) {
  assertUser(params.userId); const filters = [`actor_id=eq.${encodeURIComponent(params.userId)}`];
  if (params.filters.assetId) filters.push(`asset_id=eq.${encodeURIComponent(params.filters.assetId)}`);
  if (params.filters.projectId) filters.push(`project_id=eq.${encodeURIComponent(params.filters.projectId)}`);
  if (params.filters.from) filters.push(`occurred_at=gte.${encodeURIComponent(params.filters.from)}`);
  if (params.filters.to) filters.push(`occurred_at=lte.${encodeURIComponent(params.filters.to)}`);
  const rows = await query<EventRow[]>(params.fetcher, `/rest/v1/storyflow_v2_evidence_events?${filters.join("&")}&select=*&order=occurred_at.desc&limit=1000`);
  return { items: (rows || []).map(toEvent), disclaimer: EVIDENCE_DISCLAIMER };
}

function validateInput(input: CreateEvidenceEventInput) { if (!EVENT_TYPES.includes(input.eventType)) throw new EvidenceError("validation_failed", "Unsupported Evidence Event type."); if (!SUBJECT_TYPES.includes(input.subjectType)) throw new EvidenceError("validation_failed", "Unsupported Evidence Event subject type."); if (!input.subjectId?.trim()) throw new EvidenceError("validation_failed", "subjectId is required."); if (input.facts && (typeof input.facts !== "object" || Array.isArray(input.facts) || Object.prototype.hasOwnProperty.call(input.facts, "legalDecision") || Object.prototype.hasOwnProperty.call(input.facts, "legal_decision"))) throw new EvidenceError("validation_failed", "Evidence facts must be factual and cannot contain legal decisions."); if (input.occurredAt && Number.isNaN(Date.parse(input.occurredAt))) throw new EvidenceError("validation_failed", "occurredAt must be a valid timestamp."); }
function assertUser(userId: string) { if (!userId) throw new EvidenceError("unauthenticated", "Authentication is required."); }
function toEvent(row: EventRow) { return { id: row.id, eventType: row.event_type, subjectType: row.subject_type, subjectId: row.subject_id, occurredAt: row.occurred_at, summary: row.summary || undefined, assetId: row.asset_id || null, projectId: row.project_id || null, usageGrantId: row.usage_grant_id || null, orderId: row.order_id || null, facts: row.facts || {} }; }
async function query<T>(fetcher: EvidenceFetcher, path: string, init?: RequestInit): Promise<T> { try { return await fetcher<T>(path, init); } catch (error) { if (error instanceof EvidenceError) throw error; throw new EvidenceError("service_unavailable", error instanceof Error ? error.message : "Evidence service unavailable."); } }
