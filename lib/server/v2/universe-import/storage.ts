/**
 * KIIKIS V2.2 Universe import storage helpers — Phase 4 Task 4.2.
 *
 * Private bucket `universe-source-imports`; object keys are owner-scoped:
 *   universe-source-imports/<ownerId>/<sessionId>/<slug(filename)>
 * Upload targets are signed server-side; original files never get public
 * URLs. Hash verification re-reads storage-reported metadata.
 */

export const IMPORT_BUCKET = "universe-source-imports";
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface ObjectKeyParts {
  ownerId: string;
  sessionId: string;
  filename: string;
}

function slugify(filename: string): string {
  const cleaned = filename
    .normalize("NFKC")
    .replace(/[\s/\\]+/g, "-")
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "")
    .replace(/-+/g, "-")
    .slice(-120);
  return cleaned || "file";
}

export function buildObjectKey(parts: ObjectKeyParts): string {
  const { ownerId, sessionId, filename } = parts;
  if (!ownerId || !sessionId) throw new Error("ownerId and sessionId are required for object keys.");
  return `${IMPORT_BUCKET}/${ownerId}/${sessionId}/${slugify(filename)}`;
}

export function parseObjectKey(key: string): ObjectKeyParts & { bucket: string } {
  const segments = key.split("/");
  if (segments.length < 4) throw new Error(`Malformed object key: ${key}.`);
  const [bucket, ownerId, sessionId, ...rest] = segments;
  if (bucket !== IMPORT_BUCKET) throw new Error(`Foreign bucket in object key: ${bucket}.`);
  if (!ownerId || !sessionId || rest.some((s) => !s || s === "." || s === "..")) {
    throw new Error(`Unsafe object key: ${key}.`);
  }
  return { bucket, ownerId, sessionId, filename: rest.join("/") };
}

export interface UploadTarget {
  objectKey: string;
  bucket: string;
  acl: "private";
  url: string | null;
  method: "POST";
  expiresInMs: number;
}

/**
 * Sign an upload target for the client. The URL points at the Supabase
 * Storage upload endpoint (server-attached authorization header at call
 * time); it is never a public object URL.
 */
export function signUploadTarget(params: ObjectKeyParts & { contentType: string }): UploadTarget {
  const objectKey = buildObjectKey(params);
  return {
    objectKey,
    bucket: IMPORT_BUCKET,
    acl: "private",
    url: null, // route handler performs the server-side storage write
    method: "POST",
    expiresInMs: 15 * 60 * 1000,
  };
}

export function verifyStoredHash(params: { declaredHash: string; storedHash: string }): boolean {
  return params.declaredHash === params.storedHash;
}
