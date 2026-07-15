const ART_BUCKET = "art-assets";

export async function persistUploadedArtReference(input: {
  userId: string;
  file: File;
}) {
  const contentType = input.file.type;
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) throw new Error("ART_REFERENCE_TYPE_ERROR");
  if (input.file.size > 10 * 1024 * 1024) throw new Error("ART_REFERENCE_SIZE_ERROR");

  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${input.userId}/references/${crypto.randomUUID()}.${extension}`;
  return uploadAndSign(path, contentType, await input.file.arrayBuffer());
}

export async function persistRemoteArtImage(input: {
  userId: string;
  projectId: string;
  assetId: string;
  remoteUrl: string;
  providerTaskId: string;
  index: number;
}) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const source = await fetch(input.remoteUrl);
  if (!source.ok) throw new Error(`ART_IMAGE_DOWNLOAD_ERROR:${source.status}`);
  const contentType = source.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${input.userId}/${input.projectId}/generated/${input.assetId}/${sanitize(input.providerTaskId)}-${input.index}.${extension}`;
  return uploadAndSign(path, contentType, await source.arrayBuffer());
}

async function uploadAndSign(path: string, contentType: string, body: ArrayBuffer) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${ART_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!upload.ok) throw new Error(`ART_STORAGE_UPLOAD_ERROR:${upload.status}`);

  const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/${ART_BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
  });
  if (!signed.ok) throw new Error(`ART_STORAGE_SIGN_ERROR:${signed.status}`);
  const payload = await signed.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = payload.signedURL || payload.signedUrl;
  if (!signedPath) throw new Error("ART_STORAGE_SIGN_EMPTY");
  return { storagePath: path, previewUrl: signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}` };
}

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || crypto.randomUUID();
}
