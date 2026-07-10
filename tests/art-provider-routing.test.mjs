import assert from "node:assert/strict";
import test from "node:test";

import { ART_MODEL_CATALOG } from "../lib/art/providers/catalog.ts";
import { resolveArtProviderRoute } from "../lib/art/providers/router.ts";

test("standard users are always routed to FLUX", () => {
  const route = resolveArtProviderRoute({
    selection: "atlas",
    task: "reference_sheet",
    atlasAuthorized: false,
  });

  assert.equal(route.provider, "flux");
});

test("smart routing uses Atlas for identity-sensitive edits", () => {
  const route = resolveArtProviderRoute({
    selection: "smart",
    task: "reference_sheet",
    atlasAuthorized: true,
  });

  assert.equal(route.provider, "atlas");
  assert.equal(route.model.capabilities.includes("multi-reference"), true);
});

test("manual model selection rejects a model from another provider", () => {
  assert.throws(() => resolveArtProviderRoute({
    selection: "flux",
    task: "concept",
    atlasAuthorized: true,
    modelId: "atlascloud/qwen-image/edit-plus",
  }), /ART_MODEL_PROVIDER_MISMATCH/);
});

test("catalog has a public FLUX model and an Atlas edit model", () => {
  assert.equal(ART_MODEL_CATALOG.some((model) => model.provider === "flux"), true);
  assert.equal(ART_MODEL_CATALOG.some((model) => model.provider === "atlas" && model.capabilities.includes("image-edit")), true);
});
