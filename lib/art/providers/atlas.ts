import type { ArtImageProviderResult, ArtImageRequest, ArtModelDescriptor } from "./types.ts";

const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";

export function buildAtlasRequestBody(request: ArtImageRequest, model: ArtModelDescriptor): Record<string, unknown> {
  const references = request.referenceUrls.slice(0, model.maxReferences);
  const profile = model.atlasProfile;
  if (!profile) throw new Error("ATLAS_MODEL_PROFILE_MISSING");
  if (model.capabilities.includes("image-edit") && !references.length) throw new Error("ART_REFERENCE_REQUIRED");

  if (profile === "flux2-flex-text" || profile === "flux2-flex-edit") {
    return compact({
      model: model.id,
      prompt: request.prompt,
      images: profile === "flux2-flex-edit" ? references : undefined,
      size: fluxFlexSize(request.aspectRatio),
      guidance_scale: 5,
      num_inference_steps: 28,
      enable_prompt_expansion: true,
      output_format: "jpeg",
      safety_tolerance: 2,
      seed: request.seed ?? -1,
      enable_base64_output: false,
      enable_sync_mode: false,
    });
  }
  if (profile === "gpt25-text" || profile === "gpt25-edit") {
    return compact({
      model: model.id,
      prompt: request.prompt,
      images: profile === "gpt25-edit" ? references : undefined,
      size: gptSize(request.aspectRatio),
      quality: "medium",
      background: "auto",
      output_format: "jpeg",
      n: request.count,
    });
  }
  if (profile === "gpt-text" || profile === "gpt-edit") {
    return compact({
      model: model.id,
      prompt: request.prompt,
      images: profile === "gpt-edit" ? references : undefined,
      size: gptSize(request.aspectRatio),
      quality: "medium",
      output_format: "jpeg",
      enable_base64_output: false,
      enable_sync_mode: false,
      moderation: "low",
    });
  }
  if (profile === "seedream-text") {
    return {
      model: model.id,
      prompt: request.prompt,
      size: seedreamSize(request.aspectRatio),
      output_format: "jpeg",
      enable_base64_output: false,
    };
  }
  if (profile === "seedream-edit") {
    return {
      model: model.id,
      prompt: request.prompt,
      size: seedreamSize(request.aspectRatio),
      output_format: "jpeg",
      images: references,
      enable_base64_output: false,
    };
  }
  if (profile === "banana21-text" || profile === "banana21-edit") {
    return compact({
      model: model.id,
      prompt: request.prompt,
      reference_images: profile === "banana21-edit" ? references : undefined,
      aspect_ratio: request.aspectRatio,
      resolution: "2k",
      thinking_level: "medium",
      enable_web_search: false,
      enable_image_search: false,
    });
  }
  if (profile === "banana-ultra-text") {
    return {
      model: model.id,
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
      resolution: "4k",
      output_format: "jpeg",
      enable_base64_output: false,
      enable_sync_mode: false,
    };
  }
  if (profile === "grok-text") {
    return {
      model: model.id,
      prompt: request.prompt,
      num_images: request.count,
      aspect_ratio: request.aspectRatio,
      resolution: "1k",
      quality: "medium",
      enable_base64_output: false,
    };
  }
  if (profile === "grok-edit") {
    return {
      model: model.id,
      prompt: request.prompt,
      image_urls: references,
      num_images: request.count,
      aspect_ratio: request.aspectRatio,
      resolution: "1k",
      quality: "medium",
      enable_base64_output: false,
    };
  }
  if (profile === "hidream-text" || profile === "hidream-edit") {
    return compact({
      model: model.id,
      prompt: request.prompt,
      reference_image_urls: profile === "hidream-edit" ? references : undefined,
      image_size: hidreamSize(request.aspectRatio),
      num_inference_steps: 50,
      guidance_scale: 5,
      output_format: "jpeg",
    });
  }
  if (profile === "reve-text" || profile === "reve-edit" || profile === "reve-remix") {
    return compact({
      model: model.id,
      prompt: request.prompt,
      image: profile === "reve-edit" ? references[0] : undefined,
      images: profile === "reve-remix" ? references : undefined,
      aspect_ratio: request.aspectRatio,
      resolution: "4k",
      output_format: "jpeg",
      enable_base64_output: false,
      enable_sync_mode: false,
    });
  }
  return {
    model: model.id,
    prompt: request.prompt,
    images: references,
    aspect_ratio: request.aspectRatio,
    resolution: "4k",
    output_format: "jpeg",
    enable_base64_output: false,
    enable_sync_mode: false,
  };
}

export async function generateAtlasImages(request: ArtImageRequest, model: ArtModelDescriptor, apiKeyOverride?: string): Promise<ArtImageProviderResult[]> {
  const apiKey = apiKeyOverride?.trim() || process.env.ATLASCLOUD_API_KEY?.trim();
  if (!apiKey) throw new Error("MISSING_ATLASCLOUD_API_KEY");
  // 不再依赖 Atlas API 的 num_images 批量参数（部分 profile 会忽略该参数只返回 1 张）
  // 统一用循环单独生成 request.count 次，确保返回数量正确
  const runs = request.count;
  const tasks = await Promise.all(Array.from({ length: runs }, async (_, index) => {
    const response = await fetch(`${ATLAS_BASE_URL}/model/generateImage`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildAtlasRequestBody({ ...request, count: 1, seed: request.seed === undefined ? undefined : request.seed + index }, model)),
    });
    if (!response.ok) throw new Error(`ATLAS_API_ERROR:${response.status}`);
    const body = await response.json() as { data?: { id?: string }; id?: string };
    const taskId = body.data?.id || body.id;
    if (!taskId) throw new Error("ATLAS_INVALID_TASK_RESPONSE");
    return taskId;
  }));
  const outputs = (await Promise.all(tasks.map(async (taskId) => ({ taskId, urls: await pollAtlas(taskId, apiKey) })))).flatMap(({ taskId, urls }) => urls.map((imageUrl) => ({ taskId, imageUrl })));
  return outputs.slice(0, request.count).map(({ imageUrl, taskId }, index) => ({
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
    const body = await response.json() as { data?: { status?: string; outputs?: unknown[]; output?: unknown[]; error?: string }; status?: string; outputs?: unknown[]; output?: unknown[] };
    const data = body.data || body;
    if (data.status === "completed" || data.status === "succeeded") {
      const urls = (data.outputs || data.output || []).filter((value): value is string => typeof value === "string" && value.startsWith("http"));
      if (!urls.length) throw new Error("ATLAS_EMPTY_OUTPUT");
      return urls;
    }
    if (data.status === "failed") throw new Error("ATLAS_GENERATION_FAILED");
    await delay(1000);
  }
  throw new Error("ATLAS_GENERATION_TIMEOUT");
}

function compact(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function fluxFlexSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "1024*1024", "4:3": "1365*1024", "3:4": "1024*1365", "16:9": "1365*768", "9:16": "768*1365" }[ratio];
}

function gptSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "1024x1024", "4:3": "1536x1024", "3:4": "1024x1536", "16:9": "1536x1024", "9:16": "1024x1536" }[ratio];
}

function seedreamSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "2048*2048", "4:3": "2304*1728", "3:4": "1728*2304", "16:9": "2848*1600", "9:16": "1600*2848" }[ratio];
}

function hidreamSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "square_hd", "4:3": "landscape_4_3", "3:4": "portrait_4_3", "16:9": "landscape_16_9", "9:16": "portrait_16_9" }[ratio];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
