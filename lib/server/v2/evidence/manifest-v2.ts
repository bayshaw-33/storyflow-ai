/**
 * KIIKIS V2.2 EvidenceManifestV2 builder — Phase 1 Task 1.4.
 *
 * Builds a deterministic EvidenceManifestV2 from persisted facts:
 *   - Work Versions (immutable chain)
 *   - Conversation Messages (append-only ledger)
 *   - Generation Request Snapshots + Candidates
 *   - Evidence Events (legacy V1 chain, for compatibility)
 *
 * The same set of facts always produces the same `manifestHash` and file list
 * (order-independent). No secret, API key, or provider temporary URL is written
 * into the manifest.
 */

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";
import {
  EVIDENCE_MANIFEST_V2_SCHEMA,
  type EvidenceManifestV2,
  type EvidenceManifestFileV2,
  type EvidenceManifestGenerationEntryV2,
  type EvidenceManifestMessageEntryV2,
  type EvidenceManifestVersionEntryV2,
  assertEvidenceManifestV2,
} from "../../../contracts/v2/evidence-manifest-v2.ts";
import { KIIKIS_22_CONTRACT_VERSION } from "../../../contracts/v2/work-history.ts";

export type ManifestFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export class ManifestBuilderError extends Error {
  readonly code: "validation_failed" | "determinism_violation" | "service_unavailable";
  constructor(code: ManifestBuilderError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ManifestBuilderError";
    this.code = code;
  }
}

interface WorkVersionRow {
  id: string;
  kind: string;
  content_schema: string;
  content_hash: string;
  created_at: string;
  content_json?: unknown;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface RequestRow {
  id: string;
  base_version_id: string;
  message_ids: string[];
  operation: string;
  created_at: string;
  scope_json?: unknown;
  request_json?: unknown;
}

interface CandidateRow {
  id: string;
  request_id: string;
  status: string;
  content_hash: string;
  applied_version_id: string | null;
  content_json?: unknown;
}

interface EvidenceEventRow {
  sequence_number: number;
  event_hash: string;
}

function sha256OfString(text: string): string {
  return sha256Hex(utf8Bytes(text));
}

export interface BuildManifestInput {
  ownerId: string;
  projectId: string;
  workId: string;
  /** Optional fixed timestamp for deterministic testing. */
  now?: Date;
}

/**
 * Build an EvidenceManifestV2 from persisted facts.
 *
 * Determinism rules (PRD Task 1.4 Step 1 RED):
 *   - Same facts → same manifestHash
 *   - Different messages/versions → different hash
 *   - File order does not affect the result (sorted by archivePath)
 */
export async function buildEvidenceManifestV2(
  input: BuildManifestInput,
  fetcher: ManifestFetcher,
): Promise<EvidenceManifestV2> {
  return (await buildEvidenceSnapshotV2(input, fetcher)).manifest;
}

export async function buildEvidenceSnapshotV2(input: BuildManifestInput, fetcher: ManifestFetcher): Promise<{
  manifest: EvidenceManifestV2;
  contents: Array<{ archivePath: string; bytes: Uint8Array }>;
}> {
  if (!input.ownerId) {
    throw new ManifestBuilderError("validation_failed", "ownerId is required.");
  }
  if (!input.workId) {
    throw new ManifestBuilderError("validation_failed", "workId is required.");
  }
  if (!input.projectId) {
    throw new ManifestBuilderError("validation_failed", "projectId is required.");
  }

  // Fetch all facts in parallel.
  const [versions, messages, requests, candidates, events, units, unitVersions] = await Promise.all([
    fetchVersions(input.workId, fetcher),
    fetchMessages(input.workId, fetcher),
    fetchRequests(input.workId, fetcher),
    fetchCandidates(input.workId, fetcher),
    fetchEvidenceEvents(input.projectId, input.workId, fetcher),
    readRows(fetcher, `/rest/v1/storyflow_screenplay_units?work_id=eq.${encodeURIComponent(input.workId)}&select=*&order=id.asc`),
    readRows(fetcher, `/rest/v1/storyflow_screenplay_unit_versions?work_id=eq.${encodeURIComponent(input.workId)}&select=*&order=id.asc`),
  ]);
  const timestamps = [...versions, ...messages, ...requests, ...unitVersions].map(row => String(row.created_at ?? '')).filter(Boolean).sort();
  const now = input.now?.toISOString() ?? timestamps.at(-1) ?? "1970-01-01T00:00:00.000Z";

  // Build version entries (sorted by createdAt for determinism).
  const versionEntries: EvidenceManifestVersionEntryV2[] = versions
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((v) => ({
      workVersionId: v.id,
      kind: v.kind as "editing_draft" | "checkpoint" | "finalized",
      contentSchema: v.content_schema,
      contentHash: v.content_hash,
      createdAt: v.created_at,
    }));

  // Build message entries (sorted by createdAt).
  const messageEntries: EvidenceManifestMessageEntryV2[] = messages
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((m) => ({
      messageId: m.id,
      threadId: m.thread_id,
      role: m.role as "user" | "assistant" | "system",
      contentHash: sha256OfString(m.content),
      createdAt: m.created_at,
    }));

  // Build generation entries (sorted by createdAt).
  const candidatesByRequest = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    const list = candidatesByRequest.get(c.request_id) || [];
    list.push(c);
    candidatesByRequest.set(c.request_id, list);
  }
  const generationEntries: EvidenceManifestGenerationEntryV2[] = requests
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map((r) => ({
      requestId: r.id,
      operation: r.operation as "discuss" | "propose_change" | "generate" | "update",
      baseVersionId: r.base_version_id,
      messageIds: r.message_ids || [],
      candidates: (candidatesByRequest.get(r.id) || [])
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((c) => ({
          candidateId: c.id,
          status: c.status as "ready" | "applied" | "rejected" | "superseded",
          contentHash: c.content_hash,
          appliedVersionId: c.applied_version_id,
        })),
      createdAt: r.created_at,
    }));

  // Build file entries — one per version (content.json).
  // Files are sorted by archivePath for determinism.
  const contents = [
    ...versions.map(v => ({ archivePath: `versions/${v.id}/content.json`, data: v.content_json ?? {} })),
    ...unitVersions.map(v => ({ archivePath: `screenplay/versions/${v.id}.json`, data: v })),
    { archivePath: "screenplay/units.json", data: units.sort((a,b) => String(a.id).localeCompare(String(b.id))) },
    { archivePath: "conversations.json", data: messages },
    { archivePath: "generations.json", data: { requests, candidates: candidates.sort((a,b) => a.id.localeCompare(b.id)) } },
  ].map(file => ({ archivePath: file.archivePath, bytes: utf8Bytes(`${canonicalJson(file.data)}\n`) }))
    .sort((a,b) => a.archivePath.localeCompare(b.archivePath));
  const files: EvidenceManifestFileV2[] = contents.map(file => ({
    archivePath: file.archivePath, fileName: file.archivePath.split('/').at(-1)!,
    sha256: sha256Hex(file.bytes), byteSize: file.bytes.byteLength, contentType: "application/json",
  }));

  // Highest event sequence and chain tip.
  const highestEventSequence = events.length > 0
    ? Math.max(...events.map((e) => e.sequence_number))
    : 0;
  const eventChainTip = events.length > 0
    ? events.sort((a, b) => b.sequence_number - a.sequence_number)[0].event_hash
    : null;

  // Build the manifest WITHOUT manifestHash, then compute hash over canonicalJson.
  const manifestWithoutHash: Omit<EvidenceManifestV2, "manifestHash"> = {
    schemaVersion: EVIDENCE_MANIFEST_V2_SCHEMA,
    contractVersion: KIIKIS_22_CONTRACT_VERSION,
    ownerId: input.ownerId,
    projectId: input.projectId,
    workId: input.workId,
    highestEventSequence,
    eventChainTip,
    versions: versionEntries,
    conversations: messageEntries,
    generations: generationEntries,
    files,
    createdAt: now,
  };

  const manifestHash = sha256OfString(canonicalJson(manifestWithoutHash));

  const manifest: EvidenceManifestV2 = {
    ...manifestWithoutHash,
    manifestHash,
  };

  // Validate the built manifest.
  assertEvidenceManifestV2(manifest);

  return { manifest, contents };
}

async function readRows<T = Record<string, unknown>>(fetcher: ManifestFetcher, path: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await fetcher<T[]>(`${path}&limit=500&offset=${offset}`);
    if (!Array.isArray(rows)) throw new ManifestBuilderError("service_unavailable", "Evidence facts could not be loaded.");
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}

async function fetchVersions(workId: string, fetcher: ManifestFetcher): Promise<WorkVersionRow[]> {
  try {
    const rows = await readRows<WorkVersionRow>(fetcher,
      `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(workId)}&select=id,kind,content_schema,content_hash,content_json,created_at&order=created_at.asc,id.asc`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    throw new ManifestBuilderError("service_unavailable", "Version history could not be loaded.");
  }
}

async function fetchMessages(workId: string, fetcher: ManifestFetcher): Promise<MessageRow[]> {
  try {
    const rows = await readRows<MessageRow>(fetcher,
      `/rest/v1/storyflow_conversation_messages?work_id=eq.${encodeURIComponent(workId)}&select=id,thread_id,role,content,created_at&order=created_at.asc,id.asc`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    throw new ManifestBuilderError("service_unavailable", "Conversation history could not be loaded.");
  }
}

async function fetchRequests(workId: string, fetcher: ManifestFetcher): Promise<RequestRow[]> {
  try {
    const rows = await readRows<RequestRow>(fetcher,
      `/rest/v1/storyflow_generation_request_snapshots?work_id=eq.${encodeURIComponent(workId)}&select=id,base_version_id,message_ids,operation,scope_json,request_json,created_at&order=created_at.asc`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    throw new ManifestBuilderError("service_unavailable", "Generation history could not be loaded.");
  }
}

async function fetchCandidates(workId: string, fetcher: ManifestFetcher): Promise<CandidateRow[]> {
  try {
    const rows = await readRows<CandidateRow>(fetcher,
      `/rest/v1/storyflow_generation_candidates?work_id=eq.${encodeURIComponent(workId)}&select=id,request_id,status,content_hash,content_json,applied_version_id&order=id.asc`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    throw new ManifestBuilderError("service_unavailable", "Candidate history could not be loaded.");
  }
}

async function fetchEvidenceEvents(
  projectId: string,
  workId: string,
  fetcher: ManifestFetcher,
): Promise<EvidenceEventRow[]> {
  try {
    // Legacy V1 evidence events are scoped by project_id + source_unit_id.
    // We use the workId as source_unit_id for V2.2.
    const rows = await readRows<EvidenceEventRow>(fetcher,
      `/rest/v1/storyflow_evidence_events?project_id=eq.${encodeURIComponent(projectId)}&source_unit_id=eq.${encodeURIComponent(workId)}&select=sequence_number,event_hash&order=sequence_number.asc`,
    );
    return rows;
  } catch {
    throw new ManifestBuilderError("service_unavailable", "Evidence event history could not be loaded.");
  }
}

/**
 * Verify determinism: building twice from the same facts produces the same hash.
 */
export async function verifyManifestDeterminism(
  input: BuildManifestInput,
  fetcher: ManifestFetcher,
): Promise<boolean> {
  const m1 = await buildEvidenceManifestV2(input, fetcher);
  const m2 = await buildEvidenceManifestV2(input, fetcher);
  return m1.manifestHash === m2.manifestHash;
}
