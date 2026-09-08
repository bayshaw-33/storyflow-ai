/**
 * KIIKIS V2.2 Evidence Package builder — Phase 1 Task 1.4.
 *
 * Builds a deterministic ZIP package from an EvidenceManifestV2:
 *   - manifest.json (the EvidenceManifestV2, canonical JSON)
 *   - versions/<versionId>/content.json (one per Work Version)
 *
 * Idempotency: the package is keyed by `manifestHash`. Repeated requests
 * with the same facts return the existing package row without re-uploading.
 *
 * Download: signed URLs are short-lived (≤ 300 s) and owner-scoped.
 *
 * Schema: `kiikis.evidence-manifest/2` (V1 packages use `kiikis.evidence-package/1`
 * and remain downloadable via the legacy `/api/evidence/packages` route).
 */

import JSZip from "jszip";

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";
import { buildEvidenceSnapshotV2, type ManifestFetcher } from "./manifest-v2.ts";

export const MAX_DOWNLOAD_TTL_SECONDS = 300;
export const EVIDENCE_V2_STORAGE_BUCKET = "evidence-artifacts";
const PACKAGE_DATE = new Date("2000-01-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidencePackageV2Row {
  id: string;
  owner_id: string;
  project_id: string;
  work_id: string;
  manifest_hash: string;
  package_sha256: string;
  storage_bucket: string;
  storage_path: string;
  status: "ready" | "pending" | "failed";
  file_count: number;
  total_byte_size: number;
  created_at: string;
}

export interface EvidencePackageV2Store {
  getPackageByManifestHash(manifestHash: string): Promise<EvidencePackageV2Row | null>;
  getPackageById(ownerId: string, packageId: string): Promise<EvidencePackageV2Row | null>;
  insertPackage(row: Omit<EvidencePackageV2Row, "id" | "created_at">): Promise<EvidencePackageV2Row>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  sign(path: string, ttlSeconds: number): Promise<{ url: string; expiresIn: number }>;
}

export class EvidencePackageV2Error extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "validation_failed" | "service_unavailable";
  constructor(code: EvidencePackageV2Error["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "EvidencePackageV2Error";
    this.code = code;
  }
}


// ---------------------------------------------------------------------------
// materializeEvidencePackageV2
// ---------------------------------------------------------------------------

export interface MaterializePackageV2Input {
  ownerId: string;
  projectId: string;
  workId: string;
  now?: Date;
}

export async function materializeEvidencePackageV2(
  input: MaterializePackageV2Input,
  fetcher: ManifestFetcher,
  store: EvidencePackageV2Store,
): Promise<{ package: EvidencePackageV2Row; idempotent: boolean }> {
  if (!input.ownerId) {
    throw new EvidencePackageV2Error("validation_failed", "ownerId is required.");
  }
  if (!input.workId) {
    throw new EvidencePackageV2Error("validation_failed", "workId is required.");
  }
  if (!input.projectId) {
    throw new EvidencePackageV2Error("validation_failed", "projectId is required.");
  }

  // Build the deterministic manifest from persisted facts.
  const { manifest, contents } = await buildEvidenceSnapshotV2(input, fetcher);

  // Idempotency: if a package already exists for this manifestHash, return it.
  const existing = await store.getPackageByManifestHash(manifest.manifestHash);
  if (existing) {
    return { package: existing, idempotent: true };
  }

  // Build the ZIP package.
  const zip = new JSZip();
  const manifestBytes = utf8Bytes(`${canonicalJson(manifest)}\n`);
  zip.file("manifest.json", manifestBytes, { date: PACKAGE_DATE, createFolders: true });

  let totalByteSize = manifestBytes.byteLength;
  for (const file of contents) {
    zip.file(file.archivePath, file.bytes, {
      date: PACKAGE_DATE,
      createFolders: true,
    });
    totalByteSize += file.bytes.byteLength;
  }

  const packageBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
  });
  const packageSha256 = sha256Hex(packageBytes);

  // Upload to object storage (idempotent: object-exists is not an error).
  const storagePath = `${input.ownerId}/v2-packages/${manifest.manifestHash}.zip`;
  try {
    await store.upload(storagePath, packageBytes);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("exists") && !msg.includes("EXISTS")) {
      throw new EvidencePackageV2Error("service_unavailable", `Failed to upload package: ${msg.slice(0, 200)}`);
    }
  }

  // Insert the package record.
  const pkg = await store.insertPackage({
    owner_id: input.ownerId,
    project_id: input.projectId,
    work_id: input.workId,
    manifest_hash: manifest.manifestHash,
    package_sha256: packageSha256,
    storage_bucket: EVIDENCE_V2_STORAGE_BUCKET,
    storage_path: storagePath,
    status: "ready",
    file_count: contents.length + 1,
    total_byte_size: totalByteSize,
  });

  return { package: pkg, idempotent: false };
}


// ---------------------------------------------------------------------------
// signEvidencePackageV2
// ---------------------------------------------------------------------------

export interface SignPackageV2Input {
  packageId: string;
  requesterId: string;
  store: EvidencePackageV2Store;
  ttlSeconds?: number;
}

export async function signEvidencePackageV2(
  input: SignPackageV2Input,
): Promise<{ url: string; expiresIn: number; package: EvidencePackageV2Row }> {
  if (!input.requesterId) {
    throw new EvidencePackageV2Error("unauthenticated", "Authentication is required.");
  }
  if (!input.packageId) {
    throw new EvidencePackageV2Error("validation_failed", "packageId is required.");
  }

  const pkg = await input.store.getPackageById(input.requesterId, input.packageId);
  if (!pkg || pkg.status !== "ready") {
    throw new EvidencePackageV2Error("not_found", "Evidence package not found or not ready.");
  }

  const expiresIn = Math.min(
    Math.max(input.ttlSeconds ?? MAX_DOWNLOAD_TTL_SECONDS, 1),
    MAX_DOWNLOAD_TTL_SECONDS,
  );
  const signed = await input.store.sign(pkg.storage_path, expiresIn);
  return { ...signed, package: pkg };
}

// ---------------------------------------------------------------------------
// Server-side store factory (uses Supabase service role)
// ---------------------------------------------------------------------------

export function createServerEvidencePackageV2Store(): EvidencePackageV2Store {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("EVIDENCE_STORAGE_NOT_CONFIGURED");
  }

  const fetchWithServiceRole = (url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        ...(init.headers || {}),
      },
    });

  return {
    async getPackageByManifestHash(manifestHash) {
      const res = await fetchWithServiceRole(
        `${supabaseUrl}/rest/v1/storyflow_evidence_packages_v22?manifest_hash=eq.${encodeURIComponent(manifestHash)}&select=*`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const rows = (await res.json()) as unknown[];
      return rows.length > 0 ? (rows[0] as EvidencePackageV2Row) : null;
    },
    async getPackageById(ownerId, packageId) {
      const res = await fetchWithServiceRole(
        `${supabaseUrl}/rest/v1/storyflow_evidence_packages_v22?id=eq.${encodeURIComponent(packageId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const rows = (await res.json()) as unknown[];
      return rows.length > 0 ? (rows[0] as EvidencePackageV2Row) : null;
    },
    async insertPackage(row) {
      // Project start encodes a UUID as proj_<32 hex>. This legacy table has a
      // UUID metadata column (no project FK); retain the real ID in the manifest.
      const projectId = row.project_id.replace(
        /^proj_([\da-f]{8})([\da-f]{4})([\da-f]{4})([\da-f]{4})([\da-f]{12})$/i,
        "$1-$2-$3-$4-$5",
      );
      const res = await fetchWithServiceRole(
        `${supabaseUrl}/rest/v1/storyflow_evidence_packages_v22`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ ...row, project_id: projectId }),
        },
      );
      if (!res.ok) {
        // Fallback: fetch existing by manifest_hash (race condition handling).
        const existing = await this.getPackageByManifestHash(row.manifest_hash);
        if (existing) return existing;
        throw new Error("EVIDENCE_PACKAGE_INSERT_FAILED");
      }
      const rows = (await res.json()) as unknown[];
      return rows[0] as EvidencePackageV2Row;
    },
    async upload(path, bytes) {
      const res = await fetchWithServiceRole(
        `${supabaseUrl}/storage/v1/object/${EVIDENCE_V2_STORAGE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/zip" },
          body: bytes as unknown as BodyInit,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { message?: string }).message || "";
        if (msg.includes("already") || msg.includes("exists")) return;
        throw new Error(`EVIDENCE_UPLOAD_FAILED: ${res.status}`);
      }
    },
    async sign(path, ttlSeconds) {
      const res = await fetchWithServiceRole(
        `${supabaseUrl}/storage/v1/object/sign/${EVIDENCE_V2_STORAGE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: ttlSeconds }) },
      );
      if (!res.ok) throw new Error("EVIDENCE_SIGN_FAILED");
      const body = (await res.json()) as { signedURL: string };
      return { url: `${supabaseUrl}/storage/v1${body.signedURL}`, expiresIn: ttlSeconds };
    },
  };
}
