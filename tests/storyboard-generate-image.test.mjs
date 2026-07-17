/**
 * storyboard-generate-image tests — KIIKIS-P1-KIMI-002 §6
 *
 * Imports the injectable orchestration from lib/storyboard/generate-image
 * (Next route modules may only export HTTP verbs/config, so the pipeline
 * lives in lib). Fakes: serviceFetch (jobs table map),
 * generateArtImages, persist, loaders.
 *
 * Covers: idempotency reuse (ONE job row, reused:true on the second call),
 * version persistence + inputHash/referenceVersionIds in job input_params,
 * failure path (job row failed + IMAGE_GENERATION_FAILED), and the
 * PGRST204 storyboard_image_version_id fallback (imageVersionPersisted:false).
 * Auth is route-level and intentionally not tested here.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runShotImageGeneration } from "../lib/storyboard/generate-image.ts";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function createJobFetch() {
  const jobs = new Map();
  const fetchFn = async (path, init = {}) => {
    const url = new URL(path, "http://localhost");
    if (url.pathname !== "/rest/v1/storyflow_generation_jobs") {
      throw new Error(`unexpected fetch: ${path}`);
    }
    const method = init.method || "GET";
    if (method === "POST") {
      const row = JSON.parse(init.body);
      jobs.set(row.id, { ...row });
      return null;
    }
    if (method === "PATCH") {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const existing = jobs.get(id);
      if (!existing) throw new Error(`job not found: ${id}`);
      jobs.set(id, { ...existing, ...JSON.parse(init.body) });
      return null;
    }
    // GET — apply the filters the route actually uses.
    const ownerId = url.searchParams.get("owner_id")?.replace("eq.", "");
    const jobType = url.searchParams.get("job_type")?.replace("eq.", "");
    const idemKey = url.searchParams.get("input_params->>idempotencyKey")?.replace("eq.", "");
    const statusFilter = url.searchParams.get("status") || "";
    const limit = Number(url.searchParams.get("limit") || 100);
    let rows = [...jobs.values()];
    if (ownerId) rows = rows.filter((row) => row.owner_id === ownerId);
    if (jobType) rows = rows.filter((row) => row.job_type === jobType);
    if (idemKey) rows = rows.filter((row) => row.input_params?.idempotencyKey === idemKey);
    if (statusFilter.startsWith("not.eq.")) {
      const excluded = statusFilter.slice("not.eq.".length);
      rows = rows.filter((row) => row.status !== excluded);
    }
    return rows.slice(0, limit);
  };
  return { jobs, fetchFn };
}

function makeShot() {
  return {
    id: "shot-1",
    clientId: "shot-1",
    idSource: "server",
    sceneId: "scene-1",
    order: 1,
    sourceText: "她推开门。",
    storyBeat: "女主发现秘密",
    visualDescription: "林晚推门后停住",
    characterAssetIds: ["a-char"],
    sceneAssetId: "a-loc",
    propAssetIds: ["a-prop"],
    shotSize: "近景",
    cameraMovement: "缓推",
    angle: "平视",
    durationSeconds: 4,
    dialogue: "你在做什么？",
    emotion: "震惊",
    continuity: "保持礼服一致",
    imagePrompt: "",
    jimengPromptZh: "",
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: 1,
    analysisVersion: 1,
    sourceHash: "sha256:source",
  };
}

function makeApproved() {
  return new Map([
    [
      "a-char",
      {
        assetId: "a-char",
        name: "林晚",
        description: "角色描述",
        versionId: "v-char-1",
        storagePath: "path/char.png",
        previewUrl: "https://example.test/char.png",
        appearanceSummary: "approved: 银色短发",
      },
    ],
    [
      "a-loc",
      {
        assetId: "a-loc",
        name: "别墅客厅",
        description: "场景描述",
        versionId: "v-loc-1",
        storagePath: "path/loc.png",
        previewUrl: "https://example.test/loc.png",
        appearanceSummary: "approved: 冷光客厅",
      },
    ],
    [
      "a-prop",
      {
        assetId: "a-prop",
        name: "婚戒",
        description: "道具描述",
        versionId: null,
        storagePath: null,
        previewUrl: null,
        appearanceSummary: "复古婚戒（描述兜底）",
      },
    ],
  ]);
}

function makeDeps(overrides = {}) {
  const jobStore = createJobFetch();
  const calls = { insertedVersions: [], shotPatches: [], generated: 0 };
  const deps = {
    fetchFn: jobStore.fetchFn,
    loadShotContext: async () => ({
      shot: makeShot(),
      productionProjectId: "pp-1",
      projectId: "project-1",
      aspectRatio: "9:16",
      visualStyle: "写实豪门短剧",
    }),
    loadApprovedVersions: async () => makeApproved(),
    signReferenceUrls: async (paths) => paths.map((p) => `signed:${p}`),
    generateImages: async ({ count }) => {
      calls.generated += 1;
      return Array.from({ length: count }, (_, index) => ({
        imageUrl: `https://provider.test/img-${index}.png`,
        provider: "flux",
        model: "flux-2-pro",
        providerTaskId: `task-${index}`,
      }));
    },
    persistImage: async ({ index }) => ({ storagePath: `sp-${index}.png`, previewUrl: `https://cdn.test/pv-${index}.png` }),
    ensureVersionAnchor: async () => ({ assetId: "anchor-asset", variantId: "anchor-variant" }),
    insertVersions: async ({ versions }) => {
      calls.insertedVersions.push(versions);
      return versions.map((row, index) => ({ versionId: `version-${index}`, storagePath: row.storagePath }));
    },
    updateShotImage: async (patch) => {
      calls.shotPatches.push(patch);
    },
    ...overrides,
  };
  return { deps, jobStore, calls };
}

const BASE_INPUT = {
  ownerId: "user-1",
  shotId: "shot-1",
  idempotencyKey: "idem-1",
  count: 2,
  selection: "smart",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("generate-image: success persists versions, records referenceVersionIds + inputHash in job input_params", async () => {
  const { deps, jobStore, calls } = makeDeps();
  const result = await runShotImageGeneration(deps, BASE_INPUT);

  assert.equal(result.reused, false);
  assert.equal(result.status, "completed");
  assert.equal(result.images.length, 2);
  assert.equal(result.images[0].versionId, "version-0");
  assert.equal(result.images[0].previewUrl, "https://cdn.test/pv-0.png");
  assert.match(result.inputHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual([...result.referenceVersionIds].sort(), ["v-char-1", "v-loc-1"]);
  assert.equal(result.imageVersionPersisted, true);

  // Versions persisted through the injected store.
  assert.equal(calls.insertedVersions.length, 1);
  assert.equal(calls.insertedVersions[0].length, 2);
  assert.equal(calls.insertedVersions[0][0].prompt.length > 0, true);

  // Job row completed with the metadata the idempotent replay needs.
  const job = jobStore.jobs.get(result.jobId);
  assert.equal(job.status, "completed");
  assert.equal(job.target_type, "storyboard_shot");
  assert.equal(job.target_id, "shot-1");
  assert.equal(job.input_params.idempotencyKey, "idem-1");
  assert.equal(job.input_params.inputHash, result.inputHash);
  assert.deepEqual([...job.input_params.referenceVersionIds].sort(), ["v-char-1", "v-loc-1"]);
  assert.equal(job.result_metadata.images.length, 2);

  // Shot row patched to image_ready with the first preview + version id.
  const lastPatch = calls.shotPatches.at(-1);
  assert.equal(lastPatch.status, "image_ready");
  assert.equal(lastPatch.image_url, "https://cdn.test/pv-0.png");
  assert.equal(lastPatch.storyboard_image_version_id, "version-0");
});

test("generate-image: same idempotencyKey twice → ONE job row, second call reused:true", async () => {
  const { deps, jobStore, calls } = makeDeps();
  const first = await runShotImageGeneration(deps, BASE_INPUT);
  const second = await runShotImageGeneration(deps, BASE_INPUT);

  assert.equal(jobStore.jobs.size, 1, "exactly one job row claimed the key");
  assert.equal(calls.generated, 1, "provider called only once");
  assert.equal(second.jobId, first.jobId);
  assert.equal(second.reused, true);
  assert.equal(second.status, "completed");
  assert.equal(second.images.length, 2, "images replayed from result_metadata");
  assert.equal(second.inputHash, first.inputHash);
});

test("generate-image: provider failure marks the job failed and throws IMAGE_GENERATION_FAILED", async () => {
  const { deps, jobStore, calls } = makeDeps({
    generateImages: async () => {
      throw new Error("provider exploded");
    },
  });

  await assert.rejects(runShotImageGeneration(deps, BASE_INPUT), (error) => {
    assert.equal(error.code, "IMAGE_GENERATION_FAILED");
    return true;
  });

  assert.equal(jobStore.jobs.size, 1);
  const job = [...jobStore.jobs.values()][0];
  assert.equal(job.status, "failed");
  assert.ok(job.error.includes("provider exploded"));
  assert.equal(calls.insertedVersions.length, 0, "no versions persisted on failure");

  // The failed job does NOT satisfy the idempotency filter → a retry generates anew.
  const retry = await runShotImageGeneration({ ...deps, generateImages: makeDeps().deps.generateImages }, BASE_INPUT);
  assert.equal(retry.reused, false);
  assert.equal(jobStore.jobs.size, 2);
});

test("generate-image: PGRST204 on storyboard_image_version_id → fallback patch, imageVersionPersisted:false", async () => {
  let attempts = 0;
  const { deps, calls } = makeDeps({
    updateShotImage: async (patch) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('SUPABASE_SERVICE_ERROR:400:{"code":"PGRST204","message":"column not found"}');
      }
      calls.shotPatches.push(patch);
    },
  });

  const result = await runShotImageGeneration(deps, BASE_INPUT);
  assert.equal(result.imageVersionPersisted, false);
  assert.equal(attempts, 2, "retried without the unknown column");
  const fallbackPatch = calls.shotPatches[0];
  assert.equal(fallbackPatch.status, "image_ready");
  assert.equal(fallbackPatch.storyboard_image_version_id, undefined, "unknown column dropped on retry");
});

test("generate-image: non-PGRST204 write failure propagates (no silent degradation)", async () => {
  const { deps } = makeDeps({
    updateShotImage: async () => {
      throw new Error("SUPABASE_SERVICE_ERROR:500:boom");
    },
  });
  await assert.rejects(runShotImageGeneration(deps, BASE_INPUT), /boom/);
});

test("generate-image: missing shot → SHOT_NOT_FOUND before any job row is created", async () => {
  const { deps, jobStore } = makeDeps({ loadShotContext: async () => null });
  await assert.rejects(runShotImageGeneration(deps, BASE_INPUT), (error) => {
    assert.equal(error.code, "SHOT_NOT_FOUND");
    return true;
  });
  assert.equal(jobStore.jobs.size, 0);
});

test("generate-image: reference URLs are signed from approved storage paths only", async () => {
  let seenReferences = null;
  const { deps } = makeDeps({
    generateImages: async ({ referenceUrls, count }) => {
      seenReferences = referenceUrls;
      return Array.from({ length: count }, (_, index) => ({
        imageUrl: `https://provider.test/img-${index}.png`,
        provider: "flux",
        model: "flux-2-pro",
        providerTaskId: `task-${index}`,
      }));
    },
  });
  await runShotImageGeneration(deps, BASE_INPUT);
  assert.deepEqual(seenReferences, ["signed:path/char.png", "signed:path/loc.png"], "prop without approved version contributes nothing");
});
