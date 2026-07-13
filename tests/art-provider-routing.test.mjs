import assert from "node:assert/strict";
import test from "node:test";

import { ART_MODEL_CATALOG } from "../lib/art/providers/catalog.ts";
import { isAtlasAuthorizedUser, resolveArtProviderRoute } from "../lib/art/providers/router.ts";

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
    hasReferences: true,
  });

  assert.equal(route.provider, "atlas");
  assert.equal(route.model.capabilities.includes("multi-reference"), true);
});

test("manual model selection rejects a model from another provider", () => {
  assert.throws(() => resolveArtProviderRoute({
    selection: "flux",
    task: "concept",
    atlasAuthorized: true,
    modelId: "openai/gpt-image-2/text-to-image",
  }), /ART_MODEL_PROVIDER_MISMATCH/);
});

test("Atlas catalog exposes the approved six models with both Image 2 modes", () => {
  const atlasIds = ART_MODEL_CATALOG.filter((model) => model.provider === "atlas").map((model) => model.id);

  assert.deepEqual(atlasIds, [
    "black-forest-labs/flux-dev",
    "openai/gpt-image-2/text-to-image",
    "bytedance/seedream-v5.0-lite",
    "xai/grok-imagine-image/edit",
    "openai/gpt-image-2/edit",
    "google/nano-banana-pro/edit-ultra",
  ]);
  assert.equal(ART_MODEL_CATALOG.some((model) => model.provider === "flux"), true);
});

test("Atlas defaults to FLUX Dev without a reference image", () => {
  const route = resolveArtProviderRoute({
    selection: "atlas",
    task: "concept",
    atlasAuthorized: true,
    hasReferences: false,
  });

  assert.equal(route.model.id, "black-forest-labs/flux-dev");
});

test("Atlas defaults to GPT Image 2 Edit with a reference image", () => {
  const route = resolveArtProviderRoute({
    selection: "atlas",
    task: "edit",
    atlasAuthorized: true,
    hasReferences: true,
  });

  assert.equal(route.model.id, "openai/gpt-image-2/edit");
});

test("manual selection rejects a model with the wrong generation capability", () => {
  assert.throws(() => resolveArtProviderRoute({
    selection: "atlas",
    task: "edit",
    atlasAuthorized: true,
    hasReferences: true,
    modelId: "openai/gpt-image-2/text-to-image",
  }), /ART_MODEL_CAPABILITY_MISMATCH/);
});

test("temporary all-user Atlas access applies only when explicitly enabled", () => {
  const previous = process.env.ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS;
  const user = { id: "unlisted-user", email: "creator@example.com" };

  process.env.ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS = "true";
  assert.equal(isAtlasAuthorizedUser(user), true);

  process.env.ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS = "false";
  assert.equal(isAtlasAuthorizedUser(user), false);

  if (previous === undefined) delete process.env.ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS;
  else process.env.ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS = previous;
});
