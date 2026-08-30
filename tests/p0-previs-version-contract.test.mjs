import test from "node:test";
import assert from "node:assert/strict";

const sampleScene = {
  schemaVersion: 1,
  aspectRatio: "9:16",
  durationSeconds: 5,
  camera: {
    position: [0, 2.2, 8],
    rotation: [0, 0, 0],
    focalLength: 35,
    keyframes: [],
  },
  objects: [{
    id: "actor:1",
    kind: "actor_proxy",
    name: "Mara",
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    keyframes: [],
  }],
};

const sampleSnapshot = {
  schemaVersion: 1,
  kind: "kiikis.previs.version",
  projectId: "project-1",
  workId: "work-1",
  sourceUnitId: "episode-1",
  storyboardRevision: 7,
  sceneId: "scene-1",
  shotId: "shot-1",
  shotLabel: "场 1 · 镜头 1",
  previs: sampleScene,
  adoptedInput: {
    firstframeJobId: "image-job-1",
    firstframeUrlAtSave: "https://storage.example/frame.png",
    prompt: "camera follows Mara",
    promptInputHash: "prompt-hash-1",
    referenceVersionIds: ["asset-version-1"],
    durationSeconds: 5,
    aspectRatio: "9:16",
  },
  capabilityTranslation: {
    mode: "firstframe_prompt",
    preserved: ["first_frame", "text_prompt", "duration", "aspect_ratio"],
    lossy: ["camera_path", "actor_blocking", "focus_pull"],
  },
  snapshotHash: "snapshot-hash-1",
  createdAt: "2026-08-30T00:00:00.000Z",
};

test("previs snapshot parser preserves exact adopted input", async () => {
  const { parsePrevisVersionSnapshot } = await import("../lib/director/previs-version.ts");
  const parsed = parsePrevisVersionSnapshot(sampleSnapshot);

  assert.equal(parsed.kind, "kiikis.previs.version");
  assert.equal(parsed.adoptedInput.firstframeJobId, "image-job-1");
  assert.equal(parsed.adoptedInput.prompt, "camera follows Mara");
  assert.deepEqual(parsed.capabilityTranslation.lossy, ["camera_path", "actor_blocking", "focus_pull"]);
  assert.notEqual(parsed, sampleSnapshot);
  assert.notEqual(parsed.previs, sampleSnapshot.previs);
  assert.equal(Object.isFrozen(parsed), true);
});

test("previs snapshot parser rejects malformed scope and scene", async () => {
  const { parsePrevisVersionSnapshot } = await import("../lib/director/previs-version.ts");

  assert.throws(
    () => parsePrevisVersionSnapshot({ ...sampleSnapshot, shotId: "" }),
    /INVALID_PREVIS_VERSION/,
  );
  assert.throws(
    () => parsePrevisVersionSnapshot({ ...sampleSnapshot, previs: { schemaVersion: 1 } }),
    /INVALID_PREVIS_VERSION/,
  );
});

test("first-frame prompt providers disclose lossy motion translation", async () => {
  const { buildPrevisCapabilityTranslation } = await import("../lib/director/previs-version.ts");

  assert.deepEqual(buildPrevisCapabilityTranslation(), sampleSnapshot.capabilityTranslation);
});

test("previs shot options preserve prompt hash and reference versions", async () => {
  const { buildPrevisShotOptions } = await import("../lib/director/previs-integration.ts");
  const metadata = {
    "shot-1": {
      jimengVideoPrompt: "camera follows Mara",
      inputHash: "prompt-hash-1",
      referenceVersionIds: ["asset-version-1"],
    },
  };
  const scenes = [{
    id: "scene-1",
    idSource: "server",
    order: 1,
    heading: "INT. ROOM - NIGHT",
    location: "Room",
    shots: [{
      id: "shot-1",
      idSource: "server",
      order: 1,
      shotSize: "中景",
      durationSeconds: 5,
      cameraMovement: "跟随",
      angle: "平视",
      visualDescription: "Mara crosses the room",
      dialogue: "",
      characterAssetIds: [],
      sceneAssetId: null,
      propAssetIds: [],
    }],
  }];

  const [shot] = buildPrevisShotOptions(
    scenes,
    { characters: [], locations: [], props: [] },
    {},
    metadata,
  );

  assert.equal(shot.promptInputHash, "prompt-hash-1");
  assert.deepEqual(shot.referenceVersionIds, ["asset-version-1"]);
});
