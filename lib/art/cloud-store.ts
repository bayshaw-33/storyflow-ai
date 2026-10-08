import { ART_BUCKET, assertArtStoragePathBelongsToUser, signStoredArtImage } from "@/lib/supabase/art-storage";

export type ArtCloudScope = { projectId: string; workId: string; draftId?: never } | { draftId: string; projectId?: never; workId?: never };
export type ArtCloudDraft = { state: Record<string, unknown>; messages: unknown[]; jobs: unknown[]; [key: string]: unknown };
export type ArtCloudImage = { storagePath: string; previewUrl: string; imageUrl: string; provider: string; model: string; providerTaskId: string; seed?: number };
export type ArtCloudJob = {
  jobId: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  images: ArtCloudImage[];
  prompt?: string;
  error: string | null;
};

const MAX_JSON_BYTES = 1024 * 1024;
export const ART_JOB_TIMEOUT_MS = 330_000;

function identifier(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 128 || value.trim() !== value || /[/%\\\u0000-\u001f\u007f]/.test(value) || value.includes("..")) {
    throw new Error("ART_SCOPE_INVALID");
  }
  return value;
}

export function resolveArtCloudScope(userId: string, scope: unknown): string {
  identifier(userId);
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) throw new Error("ART_SCOPE_INVALID");
  const value = scope as Record<string, unknown>;
  const parts = value.draftId !== undefined
    ? value.projectId !== undefined || value.workId !== undefined ? null : ["draft", identifier(value.draftId)]
    : ["work", identifier(value.projectId), identifier(value.workId)];
  if (!parts) throw new Error("ART_SCOPE_INVALID");
  return `${userId}/workbench/${Buffer.from(JSON.stringify(parts)).toString("base64url")}`;
}

export function artCloudScopeFromQuery(request: Request): ArtCloudScope {
  const query = new URL(request.url).searchParams;
  return Object.fromEntries(["projectId", "workId", "draftId"].filter(key => query.has(key)).map(key => [key, query.get(key)!])) as unknown as ArtCloudScope;
}

function serialize(value: unknown): string {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body, "utf8") > MAX_JSON_BYTES) throw new Error("ART_CLOUD_PAYLOAD_TOO_LARGE");
  return body;
}

function storageRequest(storagePath: string, init?: RequestInit) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");
  return fetch(`${base}/storage/v1/object/${ART_BUCKET}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...init?.headers },
  });
}

async function readJson<T>(storagePath: string): Promise<T | null> {
  const response = await storageRequest(storagePath);
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { statusCode?: string | number };
    if (response.status === 400 && String(error.statusCode) === "404") return null;
    throw new Error(`ART_STORAGE_READ_ERROR:${response.status}`);
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_JSON_BYTES) throw new Error("ART_CLOUD_PAYLOAD_TOO_LARGE");
  try { return JSON.parse(body) as T; } catch { throw new Error("ART_STORAGE_JSON_INVALID"); }
}

async function writeJson(storagePath: string, value: unknown, createOnly = false): Promise<boolean> {
  const body = serialize(value);
  const response = await storageRequest(storagePath, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-upsert": createOnly ? "false" : "true" },
    body,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { statusCode?: string | number; error?: string };
    if (createOnly && (response.status === 409 || response.status === 400 && (String(error.statusCode) === "409" || error.error === "Duplicate"))) return false;
    throw new Error(`ART_STORAGE_WRITE_ERROR:${response.status}`);
  }
  return true;
}

export function readArtCloudDraft(userId: string, scope: ArtCloudScope): Promise<ArtCloudDraft | null> {
  return readJson(`${resolveArtCloudScope(userId, scope)}/draft.json`);
}

export async function writeArtCloudDraft(userId: string, scope: ArtCloudScope, draft: unknown): Promise<ArtCloudDraft> {
  const prefix = resolveArtCloudScope(userId, scope);
  const value = draft as ArtCloudDraft | null;
  if (!value || typeof value !== "object" || !value.state || typeof value.state !== "object" || Array.isArray(value.state) || !Array.isArray(value.messages) || !Array.isArray(value.jobs)) throw new Error("ART_DRAFT_INVALID");
  if (value.messages.length > 500 || value.jobs.length > 200) throw new Error("ART_CLOUD_PAYLOAD_TOO_LARGE");
  await writeJson(`${prefix}/draft.json`, value);
  return value;
}

export async function readArtCloudJob(userId: string, scope: ArtCloudScope, jobId: string): Promise<ArtCloudJob | null> {
  const path = `${resolveArtCloudScope(userId, scope)}/jobs/${identifier(jobId)}.json`;
  const job = await readJson<ArtCloudJob>(path);
  if (job?.status === "running" && (!Number.isFinite(Date.parse(job.expiresAt)) || Date.parse(job.expiresAt) <= Date.now())) {
    const failed: ArtCloudJob = { ...job, status: "failed", updatedAt: new Date().toISOString(), error: "ART_JOB_EXPIRED" };
    await writeJson(path, failed);
    return failed;
  }
  return job;
}

export function writeArtCloudJob(userId: string, scope: ArtCloudScope, job: ArtCloudJob, options?: { createOnly?: boolean }): Promise<boolean> {
  return writeJson(`${resolveArtCloudScope(userId, scope)}/jobs/${identifier(job.jobId)}.json`, job, options?.createOnly);
}

export function assertArtCloudImagePath(userId: string, storagePath: unknown): asserts storagePath is string {
  if (typeof storagePath !== "string" || storagePath.length > 1024 || /[%?#\s\u0000-\u001f\u007f]/.test(storagePath) || storagePath.split("/").some(part => !part || part === ".") || !/\.(png|jpe?g|webp)$/i.test(storagePath)) throw new Error("ART_STORAGE_PATH_FORBIDDEN");
  // Existing actor avatars use a separate, still owner-scoped namespace.
  const ownerPath = storagePath.startsWith("actor-avatars/") ? storagePath.slice("actor-avatars/".length) : storagePath;
  assertArtStoragePathBelongsToUser(userId, ownerPath);
}

export async function refreshArtCloudJobImages(userId: string, job: ArtCloudJob): Promise<ArtCloudJob> {
  if (job.status !== "completed") return job;
  const images = await Promise.all(job.images.map(async image => {
    assertArtCloudImagePath(userId, image.storagePath);
    return { ...image, previewUrl: await signStoredArtImage(image.storagePath, 60 * 60 * 24 * 7) };
  }));
  return { ...job, images };
}

export async function downloadArtCloudImage(userId: string, storagePath: unknown): Promise<Response> {
  assertArtCloudImagePath(userId, storagePath);
  const response = await storageRequest(storagePath);
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { statusCode?: string | number };
    if (response.status === 404 || response.status === 400 && String(error.statusCode) === "404") throw new Error("ART_IMAGE_NOT_FOUND");
    throw new Error(`ART_STORAGE_DOWNLOAD_ERROR:${response.status}`);
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes((response.headers.get("content-type") || "").split(";")[0])) throw new Error("ART_STORAGE_PATH_FORBIDDEN");
  return response;
}

export function artCloudErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (["MISSING_AUTH_TOKEN", "INVALID_AUTH_TOKEN"].includes(message)) return 401;
  if (message === "ART_STORAGE_PATH_FORBIDDEN") return 403;
  if (message === "ART_IMAGE_NOT_FOUND") return 404;
  if (message === "ART_CLOUD_PAYLOAD_TOO_LARGE") return 413;
  if (["ART_SCOPE_INVALID", "ART_DRAFT_INVALID", "ART_JOB_SCOPE_REQUIRED", "ART_REFERENCE_INVALID", "ART_REQUEST_INVALID", "ART_MODEL_NOT_FOUND", "ART_MODEL_CAPABILITY_MISMATCH"].includes(message) || error instanceof SyntaxError) return 400;
  return 502;
}
