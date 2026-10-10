import assert from "node:assert/strict";
import test from "node:test";

import * as atlas from "../lib/art/providers/atlas.ts";
import { findArtModel } from "../lib/art/providers/catalog.ts";

const request = {
  task: "concept",
  prompt: "cinematic portrait",
  negativePrompt: "blur",
  referenceUrls: [],
  aspectRatio: "9:16",
  count: 1,
  selection: "atlas",
};

function body(modelId, extra = {}) {
  const model = findArtModel(modelId);
  assert.ok(model, `${modelId} must exist in the art catalog`);
  return atlas.buildAtlasRequestBody({ ...request, ...extra }, model);
}

test("GPT Image 2.5 Flare text payload uses its documented Atlas schema", () => {
  assert.deepEqual(body("openai/gpt-image-2.5-flare/text-to-image"), {
    model: "openai/gpt-image-2.5-flare/text-to-image",
    prompt: "cinematic portrait",
    size: "1024x1536",
    quality: "medium",
    background: "auto",
    output_format: "jpeg",
    n: 1,
  });
});

test("GPT Image 2.5 Sunburst edit payload includes every reference image", () => {
  assert.deepEqual(body("openai/gpt-image-2.5-sunburst/edit", {
    task: "edit",
    referenceUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
  }), {
    model: "openai/gpt-image-2.5-sunburst/edit",
    prompt: "cinematic portrait",
    images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    size: "1024x1536",
    quality: "medium",
    background: "auto",
    output_format: "jpeg",
    n: 1,
  });
});

test("GPT Image 2 remains available for text and reference generation", () => {
  assert.equal(body("openai/gpt-image-2/text-to-image").model, "openai/gpt-image-2/text-to-image");
  assert.deepEqual(body("openai/gpt-image-2/edit", { task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }).images, ["https://example.com/reference.jpg"]);
});

test("FLUX 2 Flex payload uses size, guidance, safety and reference fields", () => {
  assert.deepEqual(body("black-forest-labs/flux-2-flex/text-to-image"), {
    model: "black-forest-labs/flux-2-flex/text-to-image",
    prompt: "cinematic portrait",
    size: "768*1365",
    guidance_scale: 5,
    num_inference_steps: 28,
    enable_prompt_expansion: true,
    output_format: "jpeg",
    safety_tolerance: 2,
    seed: -1,
    enable_base64_output: false,
    enable_sync_mode: false,
  });
  assert.deepEqual(body("black-forest-labs/flux-2-flex/edit", { task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }).images, ["https://example.com/reference.jpg"]);
});

test("Grok Imagine 2.0 uses the documented text and edit reference fields", () => {
  assert.deepEqual(body("xai/grok-imagine-image-2.0/text-to-image", { count: 4 }), {
    model: "xai/grok-imagine-image-2.0/text-to-image",
    prompt: "cinematic portrait",
    num_images: 4,
    aspect_ratio: "9:16",
    resolution: "1k",
    quality: "medium",
    enable_base64_output: false,
  });
  assert.deepEqual(body("xai/grok-imagine-image-2.0/edit", { task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }).image_urls, ["https://example.com/reference.jpg"]);
});

test("Gemini Nano Banana 2.1 and Pro Ultra use their matching quality schemas", () => {
  assert.deepEqual(body("google/nano-banana-2.1/text-to-image"), {
    model: "google/nano-banana-2.1/text-to-image",
    prompt: "cinematic portrait",
    aspect_ratio: "9:16",
    resolution: "2k",
    thinking_level: "medium",
    enable_web_search: false,
    enable_image_search: false,
  });
  assert.deepEqual(body("google/nano-banana-2.1/edit", { task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }), {
    model: "google/nano-banana-2.1/edit",
    prompt: "cinematic portrait",
    reference_images: ["https://example.com/reference.jpg"],
    aspect_ratio: "9:16",
    resolution: "2k",
    thinking_level: "medium",
    enable_web_search: false,
    enable_image_search: false,
  });
  assert.deepEqual(body("google/nano-banana-pro/text-to-image-ultra"), {
    model: "google/nano-banana-pro/text-to-image-ultra",
    prompt: "cinematic portrait",
    aspect_ratio: "9:16",
    resolution: "4k",
    output_format: "jpeg",
    enable_base64_output: false,
    enable_sync_mode: false,
  });
  assert.deepEqual(body("google/nano-banana-pro/edit-ultra", { task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }).images, ["https://example.com/reference.jpg"]);
});

test("Seedream 5.0 Flash and Pro share the supported 2K generation and edit schema", () => {
  for (const modelId of ["bytedance/seedream-v5.0-flash/text-to-image", "bytedance/seedream-v5.0-pro/text-to-image"]) {
    assert.equal(body(modelId).size, "1600*2848");
  }
  for (const modelId of ["bytedance/seedream-v5.0-flash/edit", "bytedance/seedream-v5.0-pro/edit"]) {
    assert.deepEqual(body(modelId, { task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }).images, ["https://example.com/reference.jpg"]);
  }
});

test("HiDream O1 1.5 maps ratios and passes all reference URLs", () => {
  assert.deepEqual(body("hidream-o1-1.5/text-to-image"), {
    model: "hidream-o1-1.5/text-to-image",
    prompt: "cinematic portrait",
    image_size: "portrait_16_9",
    num_inference_steps: 50,
    guidance_scale: 5,
    output_format: "jpeg",
  });
  assert.deepEqual(body("hidream-o1-1.5/edit", { task: "edit", referenceUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"] }).reference_image_urls, ["https://example.com/a.jpg", "https://example.com/b.jpg"]);
});

test("Reve 2.1 uses single-image edit and multi-image remix schemas", () => {
  assert.deepEqual(body("reve-ai/reve-2.1/text-to-image"), {
    model: "reve-ai/reve-2.1/text-to-image",
    prompt: "cinematic portrait",
    aspect_ratio: "9:16",
    resolution: "4k",
    output_format: "jpeg",
    enable_base64_output: false,
    enable_sync_mode: false,
  });
  assert.equal(body("reve-ai/reve-2.1/edit", { task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }).image, "https://example.com/reference.jpg");
  assert.deepEqual(body("reve-ai/reve-2.1/remix", { task: "edit", referenceUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"] }).images, ["https://example.com/a.jpg", "https://example.com/b.jpg"]);
});

test("every edit profile rejects requests without a reference image", () => {
  for (const model of [
    "openai/gpt-image-2.5-flare/edit",
    "black-forest-labs/flux-2-flex/edit",
    "xai/grok-imagine-image-2.0/edit",
    "hidream-o1-1.5/edit",
    "reve-ai/reve-2.1/edit",
  ]) assert.throws(() => body(model, { task: "edit" }), /ART_REFERENCE_REQUIRED/);
});
