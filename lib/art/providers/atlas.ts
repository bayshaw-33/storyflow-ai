import type { ArtImageProviderResult, ArtImageRequest, ArtModelDescriptor } from "./types.ts";

const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";

export async function generateAtlasImages(request: ArtImageRequest, model: ArtModelDescriptor, apiKeyOverride?: string): Promise<ArtImageProviderResult[]> {
  const apiKey = apiKeyOverride?.trim() || process.env.ATLASCLOUD_API_KEY?.trim();
  if (!apiKey) throw new Error("MISSING_ATLASCLOUD_API_KEY");
  const response = await fetch(`${ATLAS_BASE_URL}/model/generateImage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt || undefined,
      aspect_ratio: request.aspectRatio,
      num_images: request.count,
      seed: request.seed,
      images: request.referenceUrls.slice(0, model.maxReferences).length ? request.referenceUrls.slice(0, model.maxReferences) : undefined,
      enable_sync_mode: false,
    }),
  });
  if (!response.ok) throw new Error(`ATLAS_API_ERROR:${response.status}`);
  const body = await response.json() as { data?: { id?: string }; id?: string };
  const taskId = body.data?.id || body.id;
  if (!taskId) throw new Error("ATLAS_INVALID_TASK_RESPONSE");
  const urls = await pollAtlas(taskId, apiKey);
  return urls.slice(0, request.count).map((imageUrl, index) => ({
    imageUrl,
    provider: "atlas",
    model: model.id,
    providerTaskId: taskId,
    seed: request.seed === undefined ? undefined : request.seed + index,
  }));
}

async function pollAtlas(taskId: string, apiKey: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`${ATLAS_BASE_URL}/model/prediction/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`ATLAS_POLL_ERROR:${response.status}`);
    const body = await response.json() as { data?: { status?: string; outputs?: unknown[]; error?: string }; status?: string; outputs?: unknown[] };
    const data = body.data || body;
    if (data.status === "completed") {
      const urls = (data.outputs || []).filter((value): value is string => typeof value === "string" && value.startsWith("http"));
      if (!urls.length) throw new Error("ATLAS_EMPTY_OUTPUT");
      return urls;
    }
    if (data.status === "failed") throw new Error("ATLAS_GENERATION_FAILED");
    await delay(1000);
  }
  throw new Error("ATLAS_GENERATION_TIMEOUT");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
