import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionArtStatus,
  createEmptyArtProject,
  groupAssetsByKind,
  normalizeCandidateCount,
} from "../lib/art/state.ts";

test("creates an art project linked to its universe", () => {
  const project = createEmptyArtProject({
    id: "art-project-1",
    name: "契约之家 美术",
    ownerId: "user-1",
    universeId: "universe-1",
  });

  assert.equal(project.id, "art-project-1");
  assert.equal(project.universeId, "universe-1");
  assert.equal(project.providerSelection, "smart");
});

test("groups art assets without losing empty kinds", () => {
  const grouped = groupAssetsByKind([
    { id: "a", kind: "character" },
    { id: "b", kind: "scene" },
  ]);

  assert.deepEqual(grouped.character.map((asset) => asset.id), ["a"]);
  assert.deepEqual(grouped.scene.map((asset) => asset.id), ["b"]);
  assert.deepEqual(grouped.prop, []);
});

test("only allows approved art to publish", () => {
  assert.equal(canTransitionArtStatus("candidate", "approved"), true);
  assert.equal(canTransitionArtStatus("approved", "published"), true);
  assert.equal(canTransitionArtStatus("draft", "published"), false);
  assert.equal(canTransitionArtStatus("published", "draft"), false);
});

test("normalizes candidate count to supported values", () => {
  assert.equal(normalizeCandidateCount(1), 1);
  assert.equal(normalizeCandidateCount(2), 2);
  assert.equal(normalizeCandidateCount(4), 4);
  assert.equal(normalizeCandidateCount(3), 1);
});
