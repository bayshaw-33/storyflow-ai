import type { ArtImageProviderResult, ArtImageRequest, ArtModelDescriptor } from "./types.ts";

const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";

export function buildAtlasRequestBody(request: ArtImageRequest, model: ArtModelDescriptor): Record<string, unknown> {
  const references = request.referenceUrls.slice(0, model.maxReferences);
  const profile = model.atlasProfile;
  if (!profile) throw new Error("ATLAS_MODEL_PROFILE_MISSING");
  if (profile.endsWith("edit") && !references.length) throw new Error("ART_REFERENCE_REQUIRED");

  if (profile === "flux-text") {
    return {
      model: model.id,
      prompt: request.prompt,
      size: fluxSize(request.aspectRatio),
      num_images: request.count,
      seed: request.seed ?? -1,
      guidance_scale: 3.5,
      num_inference_steps: 28,
      enable_base64_output: false,
      enable_safety_checker: true,
    };
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
  if (profile === "banana-text") {
    return {
      model: model.id,
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
      thinking_level: "default",
      resolution: "1k",
      enable_base64_output: false,
      enable_sync_mode: false,
    };
  }
  if (profile === "banana-edit-lite") {
    return {
      model: model.id,
      prompt: request.prompt,
      images: references,
      aspect_ratio: request.aspectRatio,
      thinking_level: "default",
      resolution: "1k",
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
      enable_base64_output: false,
    };
  }
  if (profile === "mai-text" || profile === "mai-edit") {
    const { width, height } = maiDimensions(request.aspectRatio);
    return compact({
      model: model.id,
      prompt: request.prompt,
      width,
      height,
      steps: 20,
      guidance_scale: 7.5,
      images: profile === "mai-edit" ? references : undefined,
    });
  }
  if (profile === "wan-text") {
    return {
      model: model.id,
      prompt: request.prompt,
      size: "2K",
      n: request.count,
      thinking_mode: true,
      enable_base64_output: false,
    };
  }
  if (profile === "qwen-text" || profile === "qwen-edit") {
    return compact({
      model: model.id,
      prompt: request.prompt,
      size: qwenSize(request.aspectRatio),
      seed: -1,
      images: profile === "qwen-edit" ? references : undefined,
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

function fluxSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "1024*1024", "4:3": "1024*768", "3:4": "768*1024", "16:9": "1024*576", "9:16": "576*1024" }[ratio];
}

function gptSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "1024x1024", "4:3": "1536x1024", "3:4": "1024x1536", "16:9": "1536x1024", "9:16": "1024x1536" }[ratio];
}

function seedreamSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "2048*2048", "4:3": "2304*1728", "3:4": "1728*2304", "16:9": "2848*1600", "9:16": "1600*2848" }[ratio];
}

function qwenSize(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": "1024*1024", "4:3": "1280*960", "3:4": "960*1280", "16:9": "1280*720", "9:16": "720*1280" }[ratio];
}

function maiDimensions(ratio: ArtImageRequest["aspectRatio"]) {
  return { "1:1": { width: 1024, height: 1024 }, "4:3": { width: 1280, height: 960 }, "3:4": { width: 960, height: 1280 }, "16:9": { width: 1280, height: 720 }, "9:16": { width: 720, height: 1280 } }[ratio];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
