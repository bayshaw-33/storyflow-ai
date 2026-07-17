import JSZip from "jszip";

import { canonicalJson, sha256Hex, utf8Bytes } from "../compliance/manifest.ts";
import { ReleaseError } from "../release/types.ts";
import { createRestClient, createStorageClient } from "../release/storage-rest.ts";
import { assertEvidenceEventInput, verifyEvidenceChain } from "./ledger.ts";
import type { EvidenceDocumentRow, EvidenceEventRow, EvidencePackageRow, EvidenceScope } from "./types.ts";

const MAX_DOWNLOAD_TTL_SECONDS = 300;
const PACKAGE_DATE = new Date("2000-01-01T00:00:00.000Z");

type EvidenceCase = { id: string; last_event_hash: string | null };

export interface EvidencePackageStore {
  getCase(scope: EvidenceScope): Promise<EvidenceCase | null>;
  listDocuments(caseId: string, ownerId: string): Promise<EvidenceDocumentRow[]>;
  getPackage(packageSha256: string): Promise<EvidencePackageRow | null>;
  getPackageById(ownerId: string, packageId: string): Promise<EvidencePackageRow | null>;
  insertPackage(row: Omit<EvidencePackageRow, "id" | "created_at">): Promise<EvidencePackageRow>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  download(document: EvidenceDocumentRow): Promise<Uint8Array>;
  sign(path: string, ttlSeconds: number): Promise<{ url: string; expiresIn: number }>;
}

function serverStorageConfig(): { supabaseUrl: string; serviceKey: string } {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("EVIDENCE_STORAGE_NOT_CONFIGURED");
  return { supabaseUrl, serviceKey };
}

/** Builds the production store only in server request handlers. */
export function createServerEvidencePackageStore(): EvidencePackageStore {
  const { supabaseUrl, serviceKey } = serverStorageConfig();
  const fetchWithServiceRole = (url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        ...(init.headers || {}),
      },
    });
  const storage = createStorageClient(`${supabaseUrl}/storage/v1`, fetchWithServiceRole);
  const rest = createRestClient(`${supabaseUrl}/rest/v1`, fetchWithServiceRole);

  return {
    async getCase(scope) {
      const row = await rest.getRow(
        "storyflow_evidence_cases",
        `owner_id=eq.${encodeURIComponent(scope.ownerId)}&project_id=eq.${encodeURIComponent(scope.projectId)}&source_unit_id=eq.${encodeURIComponent(scope.sourceUnitId)}&select=id,last_event_hash`,
      );
      return row ? { id: String(row.id), last_event_hash: typeof row.last_event_hash === "string" ? row.last_event_hash : null } : null;
    },
    async listDocuments(caseId, ownerId) {
      const rows = await rest.getRows(
        "storyflow_evidence_documents",
        `case_id=eq.${encodeURIComponent(caseId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*`,
      );
      return rows as unknown as EvidenceDocumentRow[];
    },
    async getPackage(packageSha256) {
      const row = await rest.getRow(
        "storyflow_evidence_packages",
        `package_sha256=eq.${encodeURIComponent(packageSha256)}&select=*`,
      );
      return row as unknown as EvidencePackageRow | null;
    },
    async getPackageById(ownerId, packageId) {
      const row = await rest.getRow(
        "storyflow_evidence_packages",
        `id=eq.${encodeURIComponent(packageId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*`,
      );
      return row as unknown as EvidencePackageRow | null;
    },
    async insertPackage(row) {
      const inserted = await rest.insertRow("storyflow_evidence_packages", row as unknown as Record<string, unknown>);
      if (inserted) return inserted as unknown as EvidencePackageRow;
      const existing = await rest.getRow(
        "storyflow_evidence_packages",
        `case_id=eq.${encodeURIComponent(row.case_id)}&package_sha256=eq.${encodeURIComponent(row.package_sha256)}&select=*`,
      );
      if (!existing) throw new Error("EVIDENCE_PACKAGE_INSERT_EMPTY");
      return existing as unknown as EvidencePackageRow;
    },
    async upload(path, bytes) {
      try {
        await storage.uploadObject("evidence-artifacts", path, bytes, "application/zip");
      } catch (error) {
        if (error instanceof ReleaseError && error.code === "STORAGE_OBJECT_EXISTS") throw new Error("EVIDENCE_OBJECT_EXISTS");
        throw error;
      }
    },
    async download(document) {
      return storage.downloadObject(document.storage_bucket, document.storage_path);
    },
    async sign(path, ttlSeconds) {
      const url = await storage.signObjectUrl("evidence-artifacts", path, ttlSeconds);
      return { url, expiresIn: ttlSeconds };
    },
  };
}

export interface MaterializeEvidencePackageInput extends EvidenceScope {
  events: EvidenceEventRow[];
}

function assertScope(input: EvidenceScope): void {
  if (!input.ownerId || !input.projectId || !input.sourceUnitId) throw new Error("EVIDENCE_INVALID_SCOPE");
}

function extensionFor(name: string): string {
  const matched = name.toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return matched?.[1] ?? "bin";
}

function eventTimeline(events: EvidenceEventRow[]) {
  return events.map((event) => ({
    sequenceNumber: event.sequence_number,
    eventType: event.event_type,
    subjectType: event.subject_type,
    subjectId: event.subject_id,
    subjectVersionId: event.subject_version_id,
    payload: event.payload,
    objectSha256: event.object_sha256,
    previousEventHash: event.previous_event_hash,
    eventHash: event.event_hash,
    occurredAt: new Date(event.occurred_at).toISOString(),
  }));
}

export async function materializeEvidencePackage(
  input: MaterializeEvidencePackageInput,
  store: EvidencePackageStore,
): Promise<EvidencePackageRow> {
  assertScope(input);
  if (input.events.length === 0) throw new Error("EVIDENCE_EMPTY_CASE");
  for (const event of input.events) {
    assertEvidenceEventInput({
      ownerId: event.owner_id,
      projectId: event.project_id,
      sourceUnitId: event.source_unit_id,
      eventType: event.event_type,
      subjectType: event.subject_type,
      subjectId: event.subject_id,
      subjectVersionId: event.subject_version_id,
      payload: event.payload,
      objectSha256: event.object_sha256,
      idempotencyKey: event.idempotency_key,
    });
    if (event.owner_id !== input.ownerId || event.project_id !== input.projectId || event.source_unit_id !== input.sourceUnitId) {
      throw new Error("EVIDENCE_EVENT_SCOPE_MISMATCH");
    }
  }
  const verified = verifyEvidenceChain(input.events);
  if (!verified.valid) throw new Error(`EVIDENCE_CHAIN_INVALID:${verified.reason}`);

  const evidenceCase = await store.getCase(input);
  if (!evidenceCase) throw new Error("EVIDENCE_CASE_NOT_FOUND");
  const lastEvent = input.events.at(-1);
  if (!lastEvent || evidenceCase.last_event_hash !== lastEvent.event_hash) throw new Error("EVIDENCE_CASE_TIP_MISMATCH");

  const documents = await store.listDocuments(evidenceCase.id, input.ownerId);
  const zip = new JSZip();
  const includedDocuments: Array<{ documentType: string; fileName: string; sha256: string; archivePath: string }> = [];
  for (const document of [...documents].sort((left, right) => left.sha256.localeCompare(right.sha256))) {
    try {
      const bytes = await store.download(document);
      if (sha256Hex(bytes) !== document.sha256) continue;
      const archivePath = `rights-documents/${document.sha256}.${extensionFor(document.file_name)}`;
      zip.file(archivePath, bytes, { date: PACKAGE_DATE, createFolders: true });
      includedDocuments.push({
        documentType: document.document_type,
        fileName: document.file_name,
        sha256: document.sha256,
        archivePath,
      });
    } catch {
      // An unavailable optional rights document must never become an external URL in the package.
    }
  }

  const timeline = { schemaVersion: "kiikis.evidence-timeline/1", events: eventTimeline(input.events) };
  const manifest = {
    schemaVersion: "kiikis.evidence-package/1",
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    highestSequenceNumber: lastEvent.sequence_number,
    eventChainTip: lastEvent.event_hash,
    timelineSha256: sha256Hex(utf8Bytes(canonicalJson(timeline))),
    documents: includedDocuments,
  };
  const manifestBytes = utf8Bytes(`${canonicalJson(manifest)}\n`);
  const timelineBytes = utf8Bytes(`${canonicalJson(timeline)}\n`);
  zip.file("manifest.json", manifestBytes, { date: PACKAGE_DATE });
  zip.file("timeline.json", timelineBytes, { date: PACKAGE_DATE });
  const packageBytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  const packageSha256 = sha256Hex(packageBytes);
  const existing = await store.getPackage(packageSha256);
  if (existing) return existing;

  const storagePath = `${input.ownerId}/packages/${packageSha256}.zip`;
  try {
    await store.upload(storagePath, packageBytes);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "EVIDENCE_OBJECT_EXISTS") throw error;
  }
  return store.insertPackage({
    case_id: evidenceCase.id,
    owner_id: input.ownerId,
    project_id: input.projectId,
    source_unit_id: input.sourceUnitId,
    highest_sequence_number: lastEvent.sequence_number,
    manifest_sha256: sha256Hex(manifestBytes),
    package_sha256: packageSha256,
    storage_bucket: "evidence-artifacts",
    storage_path: storagePath,
    status: "ready",
  });
}

export async function signEvidencePackage(input: {
  packageId: string;
  requesterId: string;
  store: EvidencePackageStore;
  ttlSeconds?: number;
}): Promise<{ url: string; expiresIn: number; package: EvidencePackageRow }> {
  const evidencePackage = await input.store.getPackageById(input.requesterId, input.packageId);
  if (!evidencePackage || evidencePackage.status !== "ready") throw new Error("EVIDENCE_PACKAGE_NOT_FOUND");
  const expiresIn = Math.min(Math.max(input.ttlSeconds ?? MAX_DOWNLOAD_TTL_SECONDS, 1), MAX_DOWNLOAD_TTL_SECONDS);
  const signed = await input.store.sign(evidencePackage.storage_path, expiresIn);
  return { ...signed, package: evidencePackage };
}
