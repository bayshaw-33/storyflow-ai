/**
 * tests/dynamic-grid-store.test.mjs
 * K21-SB-007, K21-SB-008: 动态宫格分镜版本/锁定/CAS/diff
 * 用注入 fetcher mock RPC 行为，不连真实数据库。
 *
 * 同时覆盖 dynamic-grid-diff.ts 的纯函数逻辑。
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  upsertStoryboardWithCAS,
  getCurrentStoryboard,
  listStoryboardsForHandoff,
  getStoryboardHistory,
  getStoryboardById,
  hashFrames,
  isCasConflict,
  isUpsertSuccess,
  DynamicGridStoreError,
} = await import("../lib/storyboard/dynamic-grid-store.ts");

const {
  diffStoryboards,
  diffFrames,
  diffSceneMetadata,
  diffSpatialPlan,
  hasLockedOverride,
  isEmptyDiff,
} = await import("../lib/storyboard/dynamic-grid-diff.ts");

const {
  parseDynamicGridScene,
} = await import("../lib/storyboard/dynamic-grid-contract.ts");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const HANDOFF_ID = "handoff-1";
const SCENE_ID = "scene-06-01";

// ============================================================
// Fixtures
// ============================================================

function makeFrame(overrides = {}) {
  return {
    id: "frame-1",
    order: 1,
    aspectRatio: "9:16",
    visualDescription: "Dark room, moonlight through window",
    characterIds: [],
    shotSize: "wide",
    cameraMovement: "slow dolly forward toward window",
    emotion: "tense",
    dialogue: "",
    action: "Isa looks around",
    timecode: "00:00:01",
    locked: false,
    userEdited: false,
    ...overrides,
  };
}

function makeSceneInput(overrides = {}) {
  return {
    schemaVersion: "kiikis.dynamic-grid-storyboard/1",
    handoffId: HANDOFF_ID,
    sceneId: SCENE_ID,
    continuityMode: "NEW",
    gridCount: 4,
    gridRationale: "Low density scene with single character",
    spatialPlan: {
      axis: "180-degree",
      entrances: ["left"],
      screenDirections: ["left-to-right"],
    },
    sharedCinematography: "Cool blue tones, low key lighting",
    negativePrompt: "text, watermark, subtitle",
    frames: [
      makeFrame({ id: "frame-1", order: 1, characterIds: [], cameraMovement: "slow dolly forward toward window" }),
      makeFrame({ id: "frame-2", order: 2, characterIds: ["char-isa"], shotSize: "medium", cameraMovement: "static hold on Isa" }),
      makeFrame({ id: "frame-3", order: 3, characterIds: ["char-isa"], shotSize: "close-up", cameraMovement: "subtle tilt up to face" }),
      makeFrame({ id: "frame-4", order: 4, characterIds: ["char-isa"], shotSize: "wide", cameraMovement: "slow zoom out to room" }),
    ],
    ...overrides,
  };
}

function makeRow(overrides = {}) {
  const input = makeSceneInput();
  return {
    id: "sb-row-1",
    owner_id: USER_ID,
    handoff_id: HANDOFF_ID,
    scene_id: SCENE_ID,
    schema_version: input.schemaVersion,
    continuity_mode: input.continuityMode,
    grid_count: input.gridCount,
    grid_rationale: input.gridRationale,
    spatial_plan: input.spatialPlan,
    shared_cinematography: input.sharedCinematography,
    negative_prompt: input.negativePrompt,
    frames_json: input.frames,
    frames_hash: hashFrames(input.frames),
    revision: 0,
    parent_id: null,
    revision_source: "ai",
    is_current: true,
    created_by: USER_ID,
    created_at: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

function makeUpsertInput(overrides = {}) {
  const input = makeSceneInput();
  const { schemaVersion, handoffId, sceneId, ...rest } = input;
  return {
    handoffId,
    sceneId,
    continuityMode: rest.continuityMode,
    gridCount: rest.gridCount,
    gridRationale: rest.gridRationale,
    spatialPlan: rest.spatialPlan,
    sharedCinematography: rest.sharedCinematography,
    negativePrompt: rest.negativePrompt,
    frames: rest.frames,
    revisionSource: "ai",
    ...overrides,
  };
}

/** Mock fetcher for RPC create_dynamic_storyboard_revision. */
function makeUpsertFetcher(rpcResponse, opts = {}) {
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (opts.throwOn && path.includes(opts.throwOn)) {
      throw new Error(opts.throwMsg || "network down");
    }
    if (path.includes("/rpc/create_dynamic_storyboard_revision")) {
      if (opts.rpcThrows) throw new Error(opts.rpcThrows);
      return rpcResponse;
    }
    if (path.includes("/rpc/get_current_dynamic_storyboard")) {
      return opts.currentRow ?? null;
    }
    if (path.includes("/rpc/list_dynamic_storyboards_for_handoff")) {
      return opts.listRows ?? [];
    }
    if (path.includes("/rpc/list_dynamic_storyboard_history")) {
      return opts.historyRows ?? [];
    }
    if (path.includes("/storyflow_dynamic_storyboards")) {
      return opts.byIdRows ?? [];
    }
    throw new Error(`unexpected path: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

// ============================================================
// K21-SB-008: CAS 创建 — 首次创建 (expectedRevision=-1)
// ============================================================

test("K21-SB-008: 首次创建 storyboard (expectedRevision=-1) — 成功返回 revision 0", async () => {
  const newRow = makeRow({ revision: 0 });
  const rpcResp = { p_new_row: newRow, p_current_revision: 0, p_conflict_kind: "created" };
  const fetcher = makeUpsertFetcher(rpcResp);

  const result = await upsertStoryboardWithCAS({
    fetcher,
    userId: USER_ID,
    input: makeUpsertInput(),
    expectedRevision: -1,
  });

  assert.ok(isUpsertSuccess(result));
  assert.equal(result.status, "created");
  assert.equal(result.revision, 0);
  assert.equal(result.rowId, "sb-row-1");
  assert.equal(result.parentId, null);
  assert.equal(result.storyboard.sceneId, SCENE_ID);
  assert.equal(result.storyboard.frames.length, 4);

  // 验证 RPC 调用参数
  const rpcCall = fetcher.calls.find((c) => c.path.includes("/rpc/create_dynamic_storyboard_revision"));
  assert.ok(rpcCall);
  const body = JSON.parse(rpcCall.init.body);
  assert.equal(body.p_owner_id, USER_ID);
  assert.equal(body.p_handoff_id, HANDOFF_ID);
  assert.equal(body.p_scene_id, SCENE_ID);
  assert.equal(body.p_expected_revision, -1);
  assert.equal(body.p_schema_version, "kiikis.dynamic-grid-storyboard/1");
  assert.equal(body.p_grid_count, 4);
  assert.equal(body.p_revision_source, "ai");
  assert.ok(body.p_frames_hash.startsWith("sha256:"));
});

test("K21-SB-008: 未认证 — 抛 unauthenticated", async () => {
  const rpcResp = { p_new_row: makeRow(), p_current_revision: 0, p_conflict_kind: "created" };
  const fetcher = makeUpsertFetcher(rpcResp);
  await assert.rejects(
    () => upsertStoryboardWithCAS({ fetcher, userId: "", input: makeUpsertInput(), expectedRevision: -1 }),
    (err) => err instanceof DynamicGridStoreError && err.code === "unauthenticated"
  );
});

test("K21-SB-008: 无效输入 — 抛 validation_failed", async () => {
  const rpcResp = { p_new_row: makeRow(), p_current_revision: 0, p_conflict_kind: "created" };
  const fetcher = makeUpsertFetcher(rpcResp);
  await assert.rejects(
    () =>
      upsertStoryboardWithCAS({
        fetcher,
        userId: USER_ID,
        input: makeUpsertInput({ gridCount: 5 }),
        expectedRevision: -1,
      }),
    (err) => err instanceof DynamicGridStoreError && err.code === "validation_failed"
  );
});

// ============================================================
// K21-SB-008: CAS 冲突 — expectedRevision 不匹配
// ============================================================

test("K21-SB-008: CAS 冲突 (expectedRevision=0 但当前=1) — 返回 cas_mismatch + diff", async () => {
  const currentRow = makeRow({ revision: 1, id: "sb-row-2" });
  // 修改 frame-2 的 visualDescription 以产生 diff
  const modifiedFrames = makeSceneInput().frames.map((f) =>
    f.id === "frame-2" ? { ...f, visualDescription: "Bright daylight, sun through window" } : f
  );
  const rpcResp = {
    p_new_row: null,
    p_current_revision: 1,
    p_conflict_kind: "cas_mismatch",
  };
  const fetcher = makeUpsertFetcher(rpcResp, { currentRow });

  const result = await upsertStoryboardWithCAS({
    fetcher,
    userId: USER_ID,
    input: makeUpsertInput({ frames: modifiedFrames }),
    expectedRevision: 0,
  });

  assert.ok(isCasConflict(result));
  assert.equal(result.kind, "cas_mismatch");
  assert.equal(result.currentRevision, 1);
  assert.equal(result.currentStoryboard.sceneId, SCENE_ID);
  assert.ok(result.diff);
  assert.ok(result.diff.framesModified.length >= 1);
  assert.match(result.message, /CAS conflict/);
});

test("K21-SB-008: not_found 冲突 (expectedRevision=0 但逻辑 storyboard 不存在) — 返回 not_found", async () => {
  const rpcResp = {
    p_new_row: null,
    p_current_revision: -1,
    p_conflict_kind: "not_found",
  };
  const fetcher = makeUpsertFetcher(rpcResp, { currentRow: null });

  await assert.rejects(
    () =>
      upsertStoryboardWithCAS({
        fetcher,
        userId: USER_ID,
        input: makeUpsertInput(),
        expectedRevision: 0,
      }),
    (err) => err instanceof DynamicGridStoreError && err.code === "not_found"
  );
});

// ============================================================
// K21-SB-007: locked/userEdited frame 保留 — AI 重新生成不能覆盖
// ============================================================

test("K21-SB-007: AI 重新生成覆盖 locked frame — 返回 locked_override 冲突", async () => {
  const lockedRow = makeRow({
    revision: 0,
    frames_json: makeSceneInput().frames.map((f) =>
      f.id === "frame-2" ? { ...f, locked: true, visualDescription: "USER LOCKED: door close-up" } : f
    ),
  });

  // 新版本试图修改 frame-2 的 visualDescription
  const newFrames = makeSceneInput().frames.map((f) =>
    f.id === "frame-2" ? { ...f, visualDescription: "AI regenerated description" } : f
  );

  const rpcResp = {
    p_new_row: null,
    p_current_revision: 0,
    p_conflict_kind: "locked_override",
  };
  const fetcher = makeUpsertFetcher(rpcResp, { currentRow: lockedRow });

  const result = await upsertStoryboardWithCAS({
    fetcher,
    userId: USER_ID,
    input: makeUpsertInput({ frames: newFrames, revisionSource: "ai" }),
    expectedRevision: 0,
  });

  assert.ok(isCasConflict(result));
  assert.equal(result.kind, "locked_override");
  assert.equal(result.currentRevision, 0);
  // diff 中 frame-2 应被标记为 modified
  const modified = result.diff.framesModified.find((m) => m.frameId === "frame-2");
  assert.ok(modified, "frame-2 应在 modified 列表中");
  // 至少 visualDescription 字段被标记
  const fieldDelta = modified.fields.find((f) => f.field === "visualDescription");
  assert.ok(fieldDelta, "visualDescription 应在 diff 中");
  assert.equal(fieldDelta.locked, true);
});

test("K21-SB-007: user 编辑覆盖 locked frame (revisionSource=user) — 成功创建新版本", async () => {
  const newRow = makeRow({ revision: 1, id: "sb-row-2", revision_source: "user" });
  const rpcResp = { p_new_row: newRow, p_current_revision: 1, p_conflict_kind: "created" };
  const fetcher = makeUpsertFetcher(rpcResp);

  const newFrames = makeSceneInput().frames.map((f) =>
    f.id === "frame-2" ? { ...f, visualDescription: "User adjusted", userEdited: true } : f
  );

  const result = await upsertStoryboardWithCAS({
    fetcher,
    userId: USER_ID,
    input: makeUpsertInput({ frames: newFrames, revisionSource: "user" }),
    expectedRevision: 0,
  });

  assert.ok(isUpsertSuccess(result));
  assert.equal(result.status, "revision_added");
  assert.equal(result.revision, 1);
});

// ============================================================
// 幂等跳过 — 相同 frames_hash
// ============================================================

test("幂等跳过: 相同 frames_hash 返回 idempotent_skip", async () => {
  const existingRow = makeRow({ revision: 0 });
  const rpcResp = {
    p_new_row: existingRow,
    p_current_revision: 0,
    p_conflict_kind: "idempotent_skip",
  };
  const fetcher = makeUpsertFetcher(rpcResp);

  const result = await upsertStoryboardWithCAS({
    fetcher,
    userId: USER_ID,
    input: makeUpsertInput(),
    expectedRevision: 0,
  });

  assert.ok(isUpsertSuccess(result));
  assert.equal(result.status, "idempotent_skip");
  assert.equal(result.revision, 0);
});

// ============================================================
// K21-SB-008: 版本递增 — revision 0 → 1
// ============================================================

test("K21-SB-008: 版本递增 (revision 0 → 1) — 返回 revision_added", async () => {
  const newRow = makeRow({ revision: 1, id: "sb-row-2", parent_id: "sb-row-1", revision_source: "user" });
  const rpcResp = { p_new_row: newRow, p_current_revision: 1, p_conflict_kind: "created" };
  const fetcher = makeUpsertFetcher(rpcResp);

  const result = await upsertStoryboardWithCAS({
    fetcher,
    userId: USER_ID,
    input: makeUpsertInput({
      gridRationale: "Updated rationale after review",
      revisionSource: "user",
    }),
    expectedRevision: 0,
  });

  assert.ok(isUpsertSuccess(result));
  assert.equal(result.status, "revision_added");
  assert.equal(result.revision, 1);
  assert.equal(result.parentId, "sb-row-1");
});

// ============================================================
// getCurrentStoryboard
// ============================================================

test("getCurrentStoryboard 成功返回当前版本", async () => {
  const row = makeRow({ revision: 2, id: "sb-row-3" });
  const fetcher = makeUpsertFetcher(null, { currentRow: row });

  const result = await getCurrentStoryboard({
    fetcher,
    userId: USER_ID,
    handoffId: HANDOFF_ID,
    sceneId: SCENE_ID,
  });

  assert.equal(result.revision, 2);
  assert.equal(result.rowId, "sb-row-3");
  assert.equal(result.storyboard.sceneId, SCENE_ID);

  const rpcCall = fetcher.calls.find((c) => c.path.includes("/rpc/get_current_dynamic_storyboard"));
  assert.ok(rpcCall);
  const body = JSON.parse(rpcCall.init.body);
  assert.equal(body.p_owner_id, USER_ID);
  assert.equal(body.p_handoff_id, HANDOFF_ID);
  assert.equal(body.p_scene_id, SCENE_ID);
});

test("getCurrentStoryboard 不存在 — 抛 not_found", async () => {
  const fetcher = makeUpsertFetcher(null, { currentRow: null });
  await assert.rejects(
    () => getCurrentStoryboard({ fetcher, userId: USER_ID, handoffId: HANDOFF_ID, sceneId: "missing" }),
    (err) => err instanceof DynamicGridStoreError && err.code === "not_found"
  );
});

// ============================================================
// listStoryboardsForHandoff
// ============================================================

test("listStoryboardsForHandoff 返回所有场景当前版本", async () => {
  const rows = [
    makeRow({ scene_id: "scene-06-01", revision: 0 }),
    makeRow({ scene_id: "scene-06-02", id: "sb-row-2", revision: 1 }),
  ];
  const fetcher = makeUpsertFetcher(null, { listRows: rows });

  const result = await listStoryboardsForHandoff({
    fetcher,
    userId: USER_ID,
    handoffId: HANDOFF_ID,
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].sceneId, "scene-06-01");
  assert.equal(result.items[1].sceneId, "scene-06-02");
});

// ============================================================
// getStoryboardHistory
// ============================================================

test("getStoryboardHistory 返回历史版本倒序", async () => {
  const rows = [
    makeRow({ revision: 2, id: "sb-row-3" }),
    makeRow({ revision: 1, id: "sb-row-2" }),
    makeRow({ revision: 0, id: "sb-row-1" }),
  ];
  const fetcher = makeUpsertFetcher(null, { historyRows: rows });

  const result = await getStoryboardHistory({
    fetcher,
    userId: USER_ID,
    handoffId: HANDOFF_ID,
    sceneId: SCENE_ID,
  });

  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].revision, 2);
  assert.equal(result.items[1].revision, 1);
  assert.equal(result.items[2].revision, 0);
});

// ============================================================
// getStoryboardById
// ============================================================

test("getStoryboardById 成功返回指定版本", async () => {
  const row = makeRow({ id: "sb-row-2", revision: 1 });
  const fetcher = makeUpsertFetcher(null, { byIdRows: [row] });

  const result = await getStoryboardById({
    fetcher,
    userId: USER_ID,
    rowId: "sb-row-2",
  });

  assert.equal(result.rowId, "sb-row-2");
  assert.equal(result.revision, 1);

  const call = fetcher.calls.find((c) => c.path.includes("/storyflow_dynamic_storyboards"));
  assert.ok(call.path.includes("id=eq.sb-row-2"));
  assert.ok(call.path.includes(`owner_id=eq.${USER_ID}`));
});

test("getStoryboardById 不存在 — 抛 not_found", async () => {
  const fetcher = makeUpsertFetcher(null, { byIdRows: [] });
  await assert.rejects(
    () => getStoryboardById({ fetcher, userId: USER_ID, rowId: "missing" }),
    (err) => err instanceof DynamicGridStoreError && err.code === "not_found"
  );
});

// ============================================================
// fetcher 错误传播
// ============================================================

test("fetcher 抛错 — 传播 service_unavailable", async () => {
  const fetcher = makeUpsertFetcher(null, {
    throwOn: "/rpc/create_dynamic_storyboard_revision",
    throwMsg: "db down",
  });
  await assert.rejects(
    () => upsertStoryboardWithCAS({ fetcher, userId: USER_ID, input: makeUpsertInput(), expectedRevision: -1 }),
    (err) => err instanceof DynamicGridStoreError && err.code === "service_unavailable"
  );
});

// ============================================================
// hashFrames 稳定性
// ============================================================

test("hashFrames: 相同内容 (object 内 key 顺序不同) → 相同 hash", () => {
  // array 元素顺序必须一致 (frame-1 在前, frame-2 在后)
  // 但每个 object 内部 key 顺序不同, canonicalize 会对 keys sort
  const frames1 = [
    { id: "f1", order: 1, visualDescription: "a" },
    { id: "f2", order: 2, visualDescription: "b" },
  ];
  const frames2 = [
    { order: 1, id: "f1", visualDescription: "a" },
    { visualDescription: "b", id: "f2", order: 2 },
  ];
  assert.equal(hashFrames(frames1), hashFrames(frames2));
});

test("hashFrames: array 元素顺序不同 → 不同 hash", () => {
  const frames1 = [
    { id: "f1", order: 1 },
    { id: "f2", order: 2 },
  ];
  const frames2 = [
    { id: "f2", order: 2 },
    { id: "f1", order: 1 },
  ];
  assert.notEqual(hashFrames(frames1), hashFrames(frames2));
});

test("hashFrames: 不同内容 → 不同 hash", () => {
  const a = [{ id: "f1", order: 1, visualDescription: "a" }];
  const b = [{ id: "f1", order: 1, visualDescription: "b" }];
  assert.notEqual(hashFrames(a), hashFrames(b));
});

// ============================================================
// diff 纯函数测试
// ============================================================

function makeParsedScene(overrides = {}) {
  return parseDynamicGridScene(makeSceneInput(overrides));
}

test("diffStoryboards: 相同 scene → 空 diff", () => {
  const scene = makeParsedScene();
  const diff = diffStoryboards(scene, scene);
  assert.ok(isEmptyDiff(diff));
  assert.equal(diff.metadataChanged, false);
  assert.equal(diff.framesModified.length, 0);
  assert.equal(diff.similarity, 1);
  assert.equal(diff.summary, "no changes");
});

test("diffStoryboards: 修改 frame visualDescription → modified", () => {
  const prev = makeParsedScene();
  const next = makeParsedScene({
    frames: makeSceneInput().frames.map((f, i) =>
      i === 1 ? { ...f, visualDescription: "Updated visual" } : f
    ),
  });
  const diff = diffStoryboards(prev, next);
  assert.equal(diff.framesModified.length, 1);
  assert.equal(diff.framesModified[0].frameId, "frame-2");
  const field = diff.framesModified[0].fields.find((f) => f.field === "visualDescription");
  assert.ok(field);
  assert.equal(field.oldValue, "Dark room, moonlight through window");
  assert.equal(field.newValue, "Updated visual");
  assert.ok(diff.similarity < 1);
});

test("diffStoryboards: 添加 frame → added", () => {
  const prev = makeParsedScene({ gridCount: 4 });
  const next = makeParsedScene({
    gridCount: 6,
    frames: [
      ...makeSceneInput().frames,
      makeFrame({ id: "frame-5", order: 5, shotSize: "extreme close-up", cameraMovement: "macro pan" }),
      makeFrame({ id: "frame-6", order: 6, shotSize: "long", cameraMovement: "crane up" }),
    ],
  });
  const diff = diffStoryboards(prev, next);
  assert.equal(diff.framesAdded.length, 2);
  assert.equal(diff.metadataChanged, true);
  // gridCount 改变
  assert.ok(diff.metadataDeltas.find((d) => d.field === "gridCount"));
});

test("diffStoryboards: frame 被替换 → removed + added", () => {
  // prev: 6 格, frames=[f1..f6]
  const prevFrames = [
    makeFrame({ id: "f1", order: 1 }),
    makeFrame({ id: "f2", order: 2, characterIds: ["char-isa"], shotSize: "medium" }),
    makeFrame({ id: "f3", order: 3, characterIds: ["char-isa"], shotSize: "close-up" }),
    makeFrame({ id: "f4", order: 4, characterIds: ["char-isa"], shotSize: "wide" }),
    makeFrame({ id: "f5", order: 5, characterIds: ["char-isa"], shotSize: "medium", cameraMovement: "pan right" }),
    makeFrame({ id: "f6", order: 6, characterIds: ["char-isa"], shotSize: "extreme close-up", cameraMovement: "tilt down" }),
  ];
  // next: 6 格, frames=[f1,f2,f3,f4,f5,f7] (f6 被 f7 替换)
  const nextFrames = [
    makeFrame({ id: "f1", order: 1 }),
    makeFrame({ id: "f2", order: 2, characterIds: ["char-isa"], shotSize: "medium" }),
    makeFrame({ id: "f3", order: 3, characterIds: ["char-isa"], shotSize: "close-up" }),
    makeFrame({ id: "f4", order: 4, characterIds: ["char-isa"], shotSize: "wide" }),
    makeFrame({ id: "f5", order: 5, characterIds: ["char-isa"], shotSize: "medium", cameraMovement: "pan right" }),
    makeFrame({ id: "f7", order: 6, characterIds: ["char-isa"], shotSize: "long", cameraMovement: "crane up" }),
  ];
  const prev = parseDynamicGridScene({
    ...makeSceneInput(),
    gridCount: 6,
    frames: prevFrames,
  });
  const next = parseDynamicGridScene({
    ...makeSceneInput(),
    gridCount: 6,
    frames: nextFrames,
  });

  const diff = diffStoryboards(prev, next);
  assert.equal(diff.framesRemoved.length, 1);
  assert.equal(diff.framesRemoved[0].frameId, "f6");
  assert.equal(diff.framesAdded.length, 1);
  assert.equal(diff.framesAdded[0].frameId, "f7");
  assert.equal(diff.metadataChanged, false);
});

test("diffStoryboards: 不同 sceneId → 全替换", () => {
  const prev = makeParsedScene();
  const next = makeParsedScene({ sceneId: "scene-other" });
  const diff = diffStoryboards(prev, next);
  assert.equal(diff.sceneId, "scene-other");
  assert.equal(diff.framesAdded.length, 4);
  assert.equal(diff.framesRemoved.length, 4);
  assert.equal(diff.similarity, 0);
});

test("diffStoryboards: 元数据变化 (continuityMode)", () => {
  const prev = makeParsedScene({ continuityMode: "NEW" });
  const next = makeParsedScene({ continuityMode: "CONTINUOUS" });
  const diff = diffStoryboards(prev, next);
  assert.ok(diff.metadataChanged);
  const delta = diff.metadataDeltas.find((d) => d.field === "continuityMode");
  assert.ok(delta);
  assert.equal(delta.oldValue, "NEW");
  assert.equal(delta.newValue, "CONTINUOUS");
});

test("diffSpatialPlan: axis 变化 → 检测到", () => {
  const prev = { axis: "180-degree", entrances: ["left"], screenDirections: ["left-to-right"] };
  const next = { axis: "360-degree", entrances: ["left"], screenDirections: ["left-to-right"] };
  const deltas = diffSpatialPlan(prev, next);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].field, "spatialPlan.axis");
});

test("diffSpatialPlan: entrances 顺序不同但内容相同 → 无 diff", () => {
  const prev = { axis: "180", entrances: ["left", "right"], screenDirections: ["lr"] };
  const next = { axis: "180", entrances: ["right", "left"], screenDirections: ["lr"] };
  const deltas = diffSpatialPlan(prev, next);
  assert.equal(deltas.length, 0);
});

test("diffFrames: locked=true frame 修改 → field.locked=true", () => {
  const prev = makeFrame({ locked: true, visualDescription: "old" });
  const next = makeFrame({ locked: true, visualDescription: "new" });
  const deltas = diffFrames(prev, next);
  const visDelta = deltas.find((d) => d.field === "visualDescription");
  assert.ok(visDelta);
  assert.equal(visDelta.locked, true);
});

test("hasLockedOverride: locked frame 被修改 → true", () => {
  const prev = makeParsedScene({
    frames: makeSceneInput().frames.map((f) =>
      f.id === "frame-2" ? { ...f, locked: true } : f
    ),
  });
  const next = makeParsedScene({
    frames: makeSceneInput().frames.map((f) =>
      f.id === "frame-2" ? { ...f, visualDescription: "changed", locked: true } : f
    ),
  });
  const diff = diffStoryboards(prev, next);
  assert.equal(hasLockedOverride(diff), true);
});

test("hasLockedOverride: locked frame 未修改 → false", () => {
  const prev = makeParsedScene({
    frames: makeSceneInput().frames.map((f) =>
      f.id === "frame-2" ? { ...f, locked: true } : f
    ),
  });
  // 修改其他 frame (非 locked)
  const next = makeParsedScene({
    frames: makeSceneInput().frames.map((f) =>
      f.id === "frame-3" ? { ...f, visualDescription: "changed" } : f
    ),
  });
  const diff = diffStoryboards(prev, next);
  assert.equal(hasLockedOverride(diff), false);
});

test("isEmptyDiff: 无变化 → true", () => {
  const scene = makeParsedScene();
  assert.equal(isEmptyDiff(diffStoryboards(scene, scene)), true);
});

test("isEmptyDiff: 有变化 → false", () => {
  const prev = makeParsedScene();
  const next = makeParsedScene({ gridRationale: "updated" });
  assert.equal(isEmptyDiff(diffStoryboards(prev, next)), false);
});

// ============================================================
// isCasConflict / isUpsertSuccess 辅助函数
// ============================================================

test("isCasConflict / isUpsertSuccess: success result", () => {
  const success = { storyboard: {}, status: "created", revision: 0 };
  assert.equal(isCasConflict(success), false);
  assert.equal(isUpsertSuccess(success), true);
});

test("isCasConflict / isUpsertSuccess: conflict result", () => {
  const conflict = { kind: "cas_mismatch", currentRevision: 1 };
  assert.equal(isCasConflict(conflict), true);
  assert.equal(isUpsertSuccess(conflict), false);
});

// ============================================================
// summary 与 similarity 计算正确性
// ============================================================

test("diff summary: 包含变更数量", () => {
  const prev = makeParsedScene();
  const next = makeParsedScene({
    gridRationale: "updated",
    frames: makeSceneInput().frames.map((f, i) =>
      i === 0 ? { ...f, visualDescription: "changed" } : f
    ),
  });
  const diff = diffStoryboards(prev, next);
  assert.match(diff.summary, /metadata fields/);
  assert.match(diff.summary, /frames modified/);
});

test("diff similarity: 全部 10 字段修改 → 0", () => {
  const prev = makeParsedScene();
  // 修改所有 frame 的所有 10 个参与 diff 的字段
  // FRAME_DIFF_FIELDS = visualDescription, characterIds, shotSize, cameraMovement,
  //   emotion, dialogue, action, timecode, locked, userEdited
  const newFrames = makeSceneInput().frames.map((f, i) => ({
    ...f,
    visualDescription: `changed-${i}`,
    shotSize: "extreme",
    cameraMovement: "static",
    emotion: "calm",
    dialogue: "new",
    action: "new",
    timecode: `00:00:0${i + 5}`,
    characterIds: ["new-char"],
    locked: !f.locked,
    userEdited: !f.userEdited,
  }));
  const next = makeParsedScene({ frames: newFrames });
  const diff = diffStoryboards(prev, next);
  // 4 frames * 10 fields = 40 total; all 40 changed → similarity = 1 - 40/40 = 0
  assert.equal(diff.similarity, 0);
});
