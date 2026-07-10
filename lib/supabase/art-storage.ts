const ART_BUCKET = "art-assets";

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
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${ART_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: await source.arrayBuffer(),
  });
  if (!upload.ok) throw new Error(`ART_STORAGE_UPLOAD_ERROR:${upload.status}`);

  const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/${ART_BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 * 60 }),
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
