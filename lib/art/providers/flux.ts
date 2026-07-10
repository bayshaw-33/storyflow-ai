import type { ArtImageProviderResult, ArtImageRequest, ArtModelDescriptor } from "./types.ts";

const BFL_BASE_URL = "https://api.bfl.ai/v1";

export async function generateFluxImages(request: ArtImageRequest, model: ArtModelDescriptor): Promise<ArtImageProviderResult[]> {
  const apiKey = process.env.BFL_API_KEY?.trim();
  if (!apiKey) throw new Error("MISSING_BFL_API_KEY");
  const results: ArtImageProviderResult[] = [];
  for (let index = 0; index < request.count; index += 1) {
    const response = await fetch(`${BFL_BASE_URL}/${model.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json", "x-key": apiKey },
      body: JSON.stringify({
        prompt: request.prompt,
        ...dimensionsForAspectRatio(request.aspectRatio),
        seed: request.seed === undefined ? undefined : request.seed + index,
        output_format: "png",
        ...Object.fromEntries(request.referenceUrls.slice(0, model.maxReferences).map((url, referenceIndex) => [referenceIndex === 0 ? "input_image" : `input_image_${referenceIndex + 1}`, url])),
      }),
    });
    if (!response.ok) throw new Error(`BFL_API_ERROR:${response.status}`);
    const task = await response.json() as { id?: string; polling_url?: string };
    if (!task.id || !task.polling_url) throw new Error("BFL_INVALID_TASK_RESPONSE");
    const imageUrl = await pollFlux(task.polling_url, apiKey);
    results.push({ imageUrl, provider: "flux", model: model.id, providerTaskId: task.id, seed: request.seed === undefined ? undefined : request.seed + index });
  }
  return results;
}

async function pollFlux(url: string, apiKey: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(url, { headers: { accept: "application/json", "x-key": apiKey } });
    if (!response.ok) throw new Error(`BFL_POLL_ERROR:${response.status}`);
    const result = await response.json() as { status?: string; result?: { sample?: string } };
    if (result.status === "Ready" && result.result?.sample) return result.result.sample;
    if (result.status === "Error" || result.status === "Failed") throw new Error("BFL_GENERATION_FAILED");
    await delay(1000);
  }
  throw new Error("BFL_GENERATION_TIMEOUT");
}

function dimensionsForAspectRatio(aspectRatio: ArtImageRequest["aspectRatio"]) {
  const dimensions = {
    "1:1": { width: 1024, height: 1024 },
    "4:3": { width: 1408, height: 1056 },
    "3:4": { width: 1056, height: 1408 },
    "16:9": { width: 1408, height: 800 },
    "9:16": { width: 800, height: 1408 },
  };
  return dimensions[aspectRatio];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
