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

test("GPT Image 2 text payload uses the documented Atlas schema", () => {
  assert.equal(typeof atlas.buildAtlasRequestBody, "function");
  const model = findArtModel("openai/gpt-image-2/text-to-image");
  assert.ok(model);

  assert.deepEqual(atlas.buildAtlasRequestBody(request, model), {
    model: "openai/gpt-image-2/text-to-image",
    prompt: "cinematic portrait",
    size: "1024x1536",
    quality: "medium",
    output_format: "jpeg",
    enable_base64_output: false,
    enable_sync_mode: false,
    moderation: "low",
  });
});

test("GPT Image 2 edit payload includes reference images", () => {
  assert.equal(typeof atlas.buildAtlasRequestBody, "function");
  const model = findArtModel("openai/gpt-image-2/edit");
  assert.ok(model);

  assert.deepEqual(atlas.buildAtlasRequestBody({
    ...request,
    task: "edit",
    referenceUrls: ["https://example.com/reference.jpg"],
  }, model), {
    model: "openai/gpt-image-2/edit",
    prompt: "cinematic portrait",
    images: ["https://example.com/reference.jpg"],
    size: "1024x1536",
    quality: "medium",
    output_format: "jpeg",
    enable_base64_output: false,
    enable_sync_mode: false,
    moderation: "low",
  });
});

test("FLUX Dev payload uses Atlas size and batch fields", () => {
  const model = findArtModel("black-forest-labs/flux-dev");
  assert.ok(model);
  assert.deepEqual(atlas.buildAtlasRequestBody({ ...request, count: 4 }, model), {
    model: "black-forest-labs/flux-dev",
    prompt: "cinematic portrait",
    size: "576*1024",
    num_images: 4,
    seed: -1,
    guidance_scale: 3.5,
    num_inference_steps: 28,
    enable_base64_output: false,
    enable_safety_checker: true,
  });
});

test("Seedream text payload uses a supported 2K portrait size", () => {
  const model = findArtModel("bytedance/seedream-v5.0-lite");
  assert.ok(model);
  assert.deepEqual(atlas.buildAtlasRequestBody(request, model), {
    model: "bytedance/seedream-v5.0-lite",
    prompt: "cinematic portrait",
    size: "1600*2848",
    output_format: "jpeg",
    enable_base64_output: false,
  });
});

test("Grok edit payload uses image_urls and supports batches", () => {
  const model = findArtModel("xai/grok-imagine-image/edit");
  assert.ok(model);
  assert.deepEqual(atlas.buildAtlasRequestBody({ ...request, task: "edit", count: 2, referenceUrls: ["https://example.com/reference.jpg"] }, model), {
    model: "xai/grok-imagine-image/edit",
    prompt: "cinematic portrait",
    image_urls: ["https://example.com/reference.jpg"],
    num_images: 2,
    aspect_ratio: "9:16",
    resolution: "1k",
    enable_base64_output: false,
  });
});

test("Nano Banana Ultra payload requests its highest supported quality", () => {
  const model = findArtModel("google/nano-banana-pro/edit-ultra");
  assert.ok(model);
  assert.deepEqual(atlas.buildAtlasRequestBody({ ...request, task: "edit", referenceUrls: ["https://example.com/reference.jpg"] }, model), {
    model: "google/nano-banana-pro/edit-ultra",
    prompt: "cinematic portrait",
    images: ["https://example.com/reference.jpg"],
    aspect_ratio: "9:16",
    resolution: "4k",
    output_format: "jpeg",
    enable_base64_output: false,
    enable_sync_mode: false,
  });
});

test("edit profiles reject requests without a reference image", () => {
  const model = findArtModel("openai/gpt-image-2/edit");
  assert.ok(model);
  assert.throws(() => atlas.buildAtlasRequestBody({ ...request, task: "edit" }, model), /ART_REFERENCE_REQUIRED/);
});
