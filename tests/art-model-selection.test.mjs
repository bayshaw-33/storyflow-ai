import assert from "node:assert/strict";
import test from "node:test";

import { ART_MODEL_CATALOG } from "../lib/art/providers/catalog.ts";
import { listCompatibleArtModels, resolveCompatibleArtModelId } from "../lib/art/providers/selection.ts";

test("text-only mode exposes only text-to-image models", () => {
  const models = listCompatibleArtModels(ART_MODEL_CATALOG, 0);
  assert.ok(models.length > 0);
  assert.ok(models.every((model) => model.capabilities.includes("text-to-image")));
});

test("reference mode exposes only models that support the uploaded reference count", () => {
  const models = listCompatibleArtModels(ART_MODEL_CATALOG, 9);
  assert.ok(models.length > 0);
  assert.ok(models.every((model) => model.capabilities.includes("image-edit") && model.maxReferences >= 9));
  assert.equal(models.some((model) => model.id === "xai/grok-imagine-image-2.0/edit"), false);
  assert.equal(models.some((model) => model.id === "openai/gpt-image-2.5-flare/edit"), true);
});

test("uploading a reference switches an explicit model to its paired family endpoint", () => {
  assert.equal(
    resolveCompatibleArtModelId(ART_MODEL_CATALOG, "openai/gpt-image-2.5-sunburst/text-to-image", 1),
    "openai/gpt-image-2.5-sunburst/edit",
  );
});

test("removing references switches an explicit edit model back to its family text endpoint", () => {
  assert.equal(
    resolveCompatibleArtModelId(ART_MODEL_CATALOG, "xai/grok-imagine-image-2.0/edit", 0),
    "xai/grok-imagine-image-2.0/text-to-image",
  );
});

test("smart selection stays smart when generation mode changes", () => {
  assert.equal(resolveCompatibleArtModelId(ART_MODEL_CATALOG, "", 1), "");
});
