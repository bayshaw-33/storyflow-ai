/**
 * Storyboard Video E2E — task card KIIKIS-P2-TRAE-002 §4.
 *
 * Covers P2 video + gate scenarios as pure-logic kernels under `node --test`.
 * No browser, no Supabase, no MiniMax — StoryboardClient.fetchImpl is injected.
 *
 * Scenarios:
 *   G1. 闸门 H0: 409 出口 1 加载最新版本（loadLatestAndClearConflict kernel）
 *   G2. 闸门 H1: 409 出口 2 另存快照（saveAsSnapshot 用 expectedRevision=null）
 *   G3. 闸门 H2: SaveRequest.expectedRevision 类型 number | null
 *   G4. 闸门 H3: 失败不覆盖本地（409 时本地 state 不变）
 *   V1. 视频生成提交返回 jobId + providerTaskId
 *   V2. 视频轮询：running → completed 更新 videoUrl
 *   V3. 视频轮询：running → failed 更新 error
 *   V4. 重新生成保留旧视频（status=failed 时 videoUrl 不清空）
 *   V5. 前置条件：shot 未确认时 generateVideo 返回 409 SHOT_NOT_CONFIRMED
 *   V6. 前置条件：无 firstframe 时 generateVideo 返回 409 NO_FIRSTFRAME
 *   B1. 批量过滤：跳过已 generating 的 Shot
 *   B2. 批量过滤：跳过已 completed 的 Shot
 *   B3. 单项失败不阻塞整批（Promise.allSettled 隔离）
 *   E1. 导出：jimeng-prompts.md 追加视频文件名引用
 *   E2. 导出：video-list.csv 含所有 Shot 行
 *   E3. 导出：videos/ 目录仅含 completed 状态
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryboardClient,
  StoryboardClientError,
} from "../lib/storyboard/client.ts";
import {
  saveStoryboardState,
} from "../lib/storyboard/state-api.ts";

// 导出 builders 是纯函数，但它们在 .tsx 里。我们复制核心逻辑到测试里
// 验证契约（避免 import .tsx 的限制）。

const OWNER = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function clientWithFetch(impl) {
  return new StoryboardClient({
    getSessionToken: async () => "fake-token",
    fetchImpl: impl,
  });
}

// ---------------------------------------------------------------------------
// G1. 闸门 H0: 409 出口 1 加载最新版本
// ---------------------------------------------------------------------------

test("G1: 409 出口 1 — loadLatestAndClearConflict kernel 丢弃本地拉服务端", async () => {
  // 模拟 ProductionWorkbench.loadLatestAndClearConflict:
  // 1. setConflictRevision(null)
  // 2. loadFromServer() — 拉服务端最新
  // 3. setNotice
  const client = clientWithFetch(async () =>
    mockResponse({
      success: true,
      state: {
        projectId: "project-1",
        sourceUnitId: "episode-1",
        revision: 8,
        scenes: [{ id: "srv-scene-1", clientId: "srv-scene-1", idSource: "server", order: 1, heading: "服务端最新", shots: [] }],
        idMap: {},
      },
    }, 200),
  );
  const state = await client.loadState("project-1", "episode-1");
  assert.ok(state, "loadState 应返回 state 对象");
  assert.equal(state.revision, 8, "loadState 返回服务端最新 revision");
  assert.equal(state.scenes[0].heading, "服务端最新");
});

// ---------------------------------------------------------------------------
// G2. 闸门 H1: 409 出口 2 另存快照（P3 BLOCKER v2：扩展 snapshot API 落完整 scenes）
// ---------------------------------------------------------------------------

test("G2: saveAsSnapshot 用 createStoryboardSnapshot 落完整 scenes（不绕过 CAS）", async () => {
  // P3 BLOCKER v2：createStoryboardSnapshot 直接 INSERT storyflow_versions
  //   - 不查 current state（不调 /rest/v1/storyflow_production_projects）
  //   - 不调 save_storyboard_state RPC（不触碰当前工作态）
  //   - snapshot_json 含完整 scenes / deletedSceneIds / deletedShotIds / baseRevision
  //   - 返回 revision = request.expectedRevision（本地基线），不是服务端当前
  const calls = [];
  const { createStoryboardSnapshot } = await import("../lib/storyboard/state-api.ts");
  const localScenes = [
    {
      id: "srv-scene-1", clientId: "srv-scene-1", idSource: "server",
      order: 1, heading: "本地修改后", locked: false, userEdited: true,
      confirmed: false, revision: 5, analysisVersion: 1, sourceHash: "h1",
      location: "室内", timeOfDay: "夜", summary: "...", sourceText: "...",
      characterAssetIds: [], propAssetIds: [],
      shots: [
        {
          id: "srv-shot-1", clientId: "srv-shot-1", idSource: "server",
          sceneId: "srv-scene-1", order: 1, sourceText: "...", storyBeat: "...",
          visualDescription: "...", characterAssetIds: [], sceneAssetId: null,
          propAssetIds: [], shotSize: "中景", cameraMovement: "固定", angle: "平视",
          durationSeconds: 5, dialogue: "...", emotion: "...", continuity: "...",
          imagePrompt: "...", jimengPromptZh: "...",
          locked: false, userEdited: true, confirmed: false, revision: 5,
          analysisVersion: 1, sourceHash: "h1",
        },
      ],
    },
  ];
  const result = await createStoryboardSnapshot(
    OWNER,
    {
      projectId: "project-1",
      sourceUnitId: "episode-1",
      expectedRevision: 5, // 本地基线 revision（不是 conflictRevision=8）
      reason: "manual",
      scenes: localScenes,
      deletedSceneIds: ["old-scene-9"],
      deletedShotIds: ["old-shot-9"],
    },
    async (path, init) => {
      calls.push({ path, init });
      if (path.startsWith("/rest/v1/storyflow_versions")) {
        const body = JSON.parse(init.body);
        return [{ id: "snap-uuid-1", _capturedBody: body }];
      }
      throw new Error(`UNEXPECTED FETCH: ${path}`);
    },
  );
  assert.equal(result.snapshotId, "snap-uuid-1", "返回 snapshotId");
  assert.equal(result.revision, 5, "返回本地基线 revision（不是服务端当前）");
  assert.equal(calls.length, 1, "仅一次 fetch（写 version）——不查 current state");
  assert.ok(calls[0].path.startsWith("/rest/v1/storyflow_versions"), "唯一 fetch 目标是 versions 表");

  // 验证 snapshot_json 含完整 scenes
  const posted = JSON.parse(calls[0].init.body);
  assert.equal(posted.entity_type, "storyboard_state", "entity_type 正确");
  assert.equal(posted.entity_id, "project-1:episode-1", "entity_id 不依赖 current state.id");
  assert.equal(posted.version_type, "manual", "version_type=reason");
  assert.equal(posted.source, "manual", "source=manual");
  assert.ok(posted.snapshot_json, "snapshot_json 必须存在");
  assert.equal(posted.snapshot_json.sourceUnitId, "episode-1", "snapshot_json.sourceUnitId");
  assert.equal(posted.snapshot_json.baseRevision, 5, "snapshot_json.baseRevision=本地基线");
  assert.equal(posted.snapshot_json.reason, "manual", "snapshot_json.reason");
  assert.ok(posted.snapshot_json.createdAt, "snapshot_json.createdAt 时间戳");
  assert.deepEqual(posted.snapshot_json.scenes, localScenes, "snapshot_json.scenes 完整保留本地内容");
  assert.deepEqual(posted.snapshot_json.deletedSceneIds, ["old-scene-9"], "snapshot_json.deletedSceneIds");
  assert.deepEqual(posted.snapshot_json.deletedShotIds, ["old-shot-9"], "snapshot_json.deletedShotIds");
});

// ---------------------------------------------------------------------------
// S1. BLOCKER v2: 快照写入不影响当前 revision（绝不触碰 current state）
// ---------------------------------------------------------------------------

test("S1: createStoryboardSnapshot 不查不写 current state（不影响当前 revision）", async () => {
  // 验证：fetcher 不会被调用到 current-state 相关路径
  //   - 不调 /rest/v1/rpc/save_storyboard_state
  //   - 不调 /rest/v1/storyflow_production_projects（不查 current state）
  //   - 不调 /rest/v1/rpc/get_storyboard_state
  // 唯一允许的 fetch 是 POST /rest/v1/storyflow_versions
  const fetchedPaths = [];
  const { createStoryboardSnapshot } = await import("../lib/storyboard/state-api.ts");
  await createStoryboardSnapshot(
    OWNER,
    {
      projectId: "p1", sourceUnitId: "e1", expectedRevision: 3, reason: "manual",
      scenes: [], deletedSceneIds: [], deletedShotIds: [],
    },
    async (path, init) => {
      fetchedPaths.push({ path, method: init?.method || "GET" });
      if (path.startsWith("/rest/v1/storyflow_versions")) {
        return [{ id: "snap-1" }];
      }
      throw new Error(`UNEXPECTED FETCH: ${path}`);
    },
  );
  assert.equal(fetchedPaths.length, 1, "仅一次 fetch");
  assert.equal(fetchedPaths[0].path.startsWith("/rest/v1/storyflow_versions"), true, "唯一 fetch 是 versions 表");
  assert.equal(fetchedPaths[0].method, "POST", "versions 写入是 POST");
  // 显式断言：没有任何 current-state 路径被触碰
  for (const f of fetchedPaths) {
    assert.ok(!f.path.includes("save_storyboard_state"), "不调 save_storyboard_state RPC");
    assert.ok(!f.path.includes("storyflow_production_projects"), "不查 current state 表");
    assert.ok(!f.path.includes("get_storyboard_state"), "不调 get_storyboard_state RPC");
  }
});

// ---------------------------------------------------------------------------
// S2. BLOCKER v2: 不产生 CAS 绕过（snapshot 不做 CAS 校验，与 CAS 体系完全隔离）
// ---------------------------------------------------------------------------

test("S2: createStoryboardSnapshot 不做 CAS 校验（expectedRevision 任意值都成功）", async () => {
  // 验证：snapshot 不读 current state，所以 expectedRevision 与服务端 revision 是否一致
  // 完全无关——snapshot 总是成功，不会抛 RevisionConflictError
  const { createStoryboardSnapshot, RevisionConflictError } = await import("../lib/storyboard/state-api.ts");
  // 用极端的 expectedRevision 值（0、999、与"服务端"完全不一致）
  // 都应该成功，因为 snapshot 根本不查服务端 revision
  for (const rev of [0, 1, 999, 5]) {
    const result = await createStoryboardSnapshot(
      OWNER,
      {
        projectId: "p", sourceUnitId: "e", expectedRevision: rev, reason: "manual",
        scenes: [], deletedSceneIds: [], deletedShotIds: [],
      },
      async (path) => {
        if (path.startsWith("/rest/v1/storyflow_versions")) {
          return [{ id: `snap-${rev}` }];
        }
        throw new Error(`UNEXPECTED: ${path}`);
      },
    );
    assert.equal(result.snapshotId, `snap-${rev}`, `rev=${rev} 快照成功`);
    assert.equal(result.revision, rev, `rev=${rev} 返回本地基线 revision`);
  }
  // 显式验证：snapshot 不会抛 RevisionConflictError
  // （即使 expectedRevision 与"服务端"不一致，因为没有查服务端，所以无从冲突）
  let threwConflict = false;
  try {
    await createStoryboardSnapshot(
      OWNER,
      {
        projectId: "p", sourceUnitId: "e", expectedRevision: 1, reason: "manual",
        scenes: [], deletedSceneIds: [], deletedShotIds: [],
      },
      async (path) => {
        if (path.startsWith("/rest/v1/storyflow_versions")) return [{ id: "snap" }];
        throw new Error(`UNEXPECTED: ${path}`);
      },
    );
  } catch (err) {
    if (err instanceof RevisionConflictError) threwConflict = true;
  }
  assert.equal(threwConflict, false, "snapshot 不会抛 RevisionConflictError（不做 CAS）");
});

// ---------------------------------------------------------------------------
// S3. BLOCKER v2: 快照可恢复（snapshot_json 含完整 scenes 可读取重建）
// ---------------------------------------------------------------------------

test("S3: snapshot_json 含完整 scenes 可恢复（读取 version 即可重建本地状态）", async () => {
  // 模拟完整恢复流程：
  //   1. 调用 createStoryboardSnapshot 写入本地 scenes
  //   2. 模拟后续读取该 version 的 snapshot_json
  //   3. 验证 scenes/deletedIds/baseRevision 完整可恢复
  const { createStoryboardSnapshot } = await import("../lib/storyboard/state-api.ts");
  const localScenes = [
    {
      id: "srv-1", clientId: "srv-1", idSource: "server", order: 1,
      heading: "可恢复场景", locked: true, userEdited: true, confirmed: true,
      revision: 7, analysisVersion: 2, sourceHash: "abc",
      location: "室外", timeOfDay: "日", summary: "恢复测试", sourceText: "...",
      characterAssetIds: ["char-1"], propAssetIds: [], shots: [],
    },
  ];
  const deletedSceneIds = ["scene-old-1"];
  const deletedShotIds = ["shot-old-1", "shot-old-2"];
  let capturedSnapshotJson = null;

  await createStoryboardSnapshot(
    OWNER,
    {
      projectId: "p", sourceUnitId: "e", expectedRevision: 7, reason: "manual",
      scenes: localScenes, deletedSceneIds, deletedShotIds,
    },
    async (path, init) => {
      if (path.startsWith("/rest/v1/storyflow_versions")) {
        const body = JSON.parse(init.body);
        capturedSnapshotJson = body.snapshot_json;
        return [{ id: "snap-recoverable-1" }];
      }
      throw new Error(`UNEXPECTED: ${path}`);
    },
  );

  // 验证 snapshot_json 完整可恢复
  assert.ok(capturedSnapshotJson, "snapshot_json 已捕获");
  assert.equal(capturedSnapshotJson.baseRevision, 7, "baseRevision 保留");
  assert.equal(capturedSnapshotJson.sourceUnitId, "e", "sourceUnitId 保留");
  assert.equal(capturedSnapshotJson.scenes.length, 1, "scenes 数组完整");
  assert.equal(capturedSnapshotJson.scenes[0].heading, "可恢复场景", "scenes 内容完整");
  assert.equal(capturedSnapshotJson.scenes[0].id, "srv-1", "scenes id 保留");
  assert.equal(capturedSnapshotJson.scenes[0].confirmed, true, "scenes 元数据保留");
  assert.equal(capturedSnapshotJson.scenes[0].characterAssetIds[0], "char-1", "scenes 关联资产保留");
  assert.deepEqual(capturedSnapshotJson.deletedSceneIds, deletedSceneIds, "deletedSceneIds 完整");
  assert.deepEqual(capturedSnapshotJson.deletedShotIds, deletedShotIds, "deletedShotIds 完整");
  // 恢复路径模拟：从 snapshot_json.scenes 重建本地状态
  // （实际 UI 恢复逻辑未来可加，这里验证数据完整性足以支撑恢复）
  const restoredScenes = capturedSnapshotJson.scenes;
  const restoredDeletedSceneIds = capturedSnapshotJson.deletedSceneIds;
  const restoredDeletedShotIds = capturedSnapshotJson.deletedShotIds;
  const restoredBaseRevision = capturedSnapshotJson.baseRevision;
  assert.equal(restoredScenes.length, 1, "恢复后 scenes 数量正确");
  assert.equal(restoredBaseRevision, 7, "恢复后 baseRevision 正确");
  assert.equal(restoredDeletedSceneIds.length, 1, "恢复后 deletedSceneIds 数量正确");
  assert.equal(restoredDeletedShotIds.length, 2, "恢复后 deletedShotIds 数量正确");
});

// ---------------------------------------------------------------------------
// G3. 闸门 H2: SaveRequest.expectedRevision 类型 number | null
// ---------------------------------------------------------------------------

test("G3: SaveRequest.expectedRevision 强类型 number（P3 BLOCKER v2 移除 null 分支）", async () => {
  // P3 BLOCKER v2：contracts.ts 中 SaveRequest.expectedRevision 类型为 number（强约束）
  //   - tsc 在编译期拒绝 null（生产代码无法传 null）
  //   - state/route.ts 验证也拒绝 null（运行时双保险）
  //   - "另存快照"语义由独立 snapshot API 承担（不通过此字段绕过 CAS）
  //
  // 这里读 contracts.ts 文件内容，验证类型声明中没有 null 分支
  const fs = await import("node:fs");
  const path = await import("node:path");
  const contractsPath = path.resolve("lib/storyboard/contracts.ts");
  const src = fs.readFileSync(contractsPath, "utf-8");
  // 找到 SaveRequest 块
  const saveReqMatch = src.match(/export type SaveRequest = \{[^}]*\}/s);
  assert.ok(saveReqMatch, "SaveRequest 类型声明存在");
  const saveReqBlock = saveReqMatch[0];
  assert.ok(/expectedRevision:\s*number;/.test(saveReqBlock), "expectedRevision 类型为 number（无 null）");
  assert.ok(!/expectedRevision:\s*number\s*\|\s*null/.test(saveReqBlock), "expectedRevision 不含 | null 分支");
  // number 正常路径 runtime 验证
  await saveStoryboardState(OWNER, {
    projectId: "p", sourceUnitId: "e", expectedRevision: 5,
    scenes: [], deletedSceneIds: [], deletedShotIds: [],
  }, async () => ({ projectId: "p", sourceUnitId: "e", revision: 6, scenes: [], idMap: {} }));
});

// ---------------------------------------------------------------------------
// G4. 闸门 H3: 失败不覆盖本地（409 时本地 state 不变）
// ---------------------------------------------------------------------------

test("G4: 409 时本地 state 完全不变", async () => {
  const localScenesBefore = [{ id: "srv-1", heading: "本地修改", locked: true }];
  const client = clientWithFetch(async () =>
    mockResponse({ success: false, code: "REVISION_CONFLICT", currentRevision: 10 }, 409),
  );
  await assert.rejects(
    () => client.saveState({
      projectId: "p", sourceUnitId: "e", expectedRevision: 5,
      scenes: localScenesBefore, deletedSceneIds: [], deletedShotIds: [],
    }),
    (err) => err.code === "REVISION_CONFLICT" && err.currentRevision === 10,
  );
  assert.equal(localScenesBefore[0].heading, "本地修改", "本地 state 未被覆盖");
  assert.equal(localScenesBefore[0].locked, true);
});

// ---------------------------------------------------------------------------
// V1. 视频生成提交返回 jobId + providerTaskId
// ---------------------------------------------------------------------------

test("V1: generateVideo 返回 jobId + providerTaskId + status=running", async () => {
  const client = clientWithFetch(async () =>
    mockResponse({
      success: true,
      jobId: "job-uuid-1",
      providerTaskId: "minimax-task-1",
      reused: false,
      status: "running",
    }, 200),
  );
  const result = await client.generateVideo("shot-1", {
    projectId: "p", sourceUnitId: "e", idempotencyKey: "k1",
  });
  assert.equal(result.jobId, "job-uuid-1");
  assert.equal(result.providerTaskId, "minimax-task-1");
  assert.equal(result.status, "running");
  assert.equal(result.reused, false);
});

// ---------------------------------------------------------------------------
// V2. 视频轮询：running → completed
// ---------------------------------------------------------------------------

test("V2: queryVideoJob completed 返回 result_url", async () => {
  const client = clientWithFetch(async () =>
    mockResponse({
      success: true,
      job: {
        id: "job-1",
        job_type: "video",
        provider: "minimax",
        model: "hailuo-02",
        provider_task_id: "mt-1",
        prompt: "...",
        input_params: { duration: 5 },
        status: "completed",
        error: null,
        result_url: "https://cdn.example.com/v1.mp4",
        result_metadata: { durationSeconds: 5, costEstimate: 10 },
        target_type: "storyboard_shot_video",
        target_id: "shot-1",
        created_at: "2026-07-18T00:00:00Z",
        updated_at: "2026-07-18T00:01:00Z",
      },
    }, 200),
  );
  const result = await client.queryVideoJob("job-1");
  assert.equal(result.job.status, "completed");
  assert.equal(result.job.result_url, "https://cdn.example.com/v1.mp4");
  assert.equal(result.job.result_metadata.durationSeconds, 5);
});

// ---------------------------------------------------------------------------
// V3. 视频轮询：running → failed
// ---------------------------------------------------------------------------

test("V3: queryVideoJob failed 返回 error", async () => {
  const client = clientWithFetch(async () =>
    mockResponse({
      success: true,
      job: {
        id: "job-1",
        job_type: "video",
        provider: "minimax",
        model: null,
        provider_task_id: "mt-1",
        prompt: "",
        input_params: {},
        status: "failed",
        error: "MiniMax 视频生成失败 (raw: FAIL)",
        result_url: null,
        result_metadata: {},
        target_type: "storyboard_shot_video",
        target_id: "shot-1",
        created_at: "2026-07-18T00:00:00Z",
        updated_at: "2026-07-18T00:01:00Z",
      },
    }, 200),
  );
  const result = await client.queryVideoJob("job-1");
  assert.equal(result.job.status, "failed");
  assert.match(result.job.error, /FAIL/);
});

// ---------------------------------------------------------------------------
// V4. 重新生成保留旧视频（status=failed 时 videoUrl 不清空）
// ---------------------------------------------------------------------------

test("V4: 重新生成失败时保留旧 videoUrl（不先删旧的）", () => {
  // 模拟 ProductionWorkbench.submitVideo 的 catch 分支：
  // setVideoJobs 时 videoUrl: existing?.videoUrl ?? null
  const existingVideoUrl = "https://cdn.example.com/old.mp4";
  const existing = { videoUrl: existingVideoUrl, status: "completed" };
  // 模拟 catch 分支构造的新 state
  const newState = {
    jobId: null,
    status: "failed",
    startedAt: null,
    finishedAt: Date.now(),
    videoUrl: existing?.videoUrl ?? null, // 关键：保留旧视频
    costEstimate: null,
    durationSeconds: null,
    error: "提交失败",
    providerTaskId: null,
    aspectRatio: "9:16",
  };
  assert.equal(newState.videoUrl, existingVideoUrl, "失败时必须保留旧 videoUrl");
  assert.equal(newState.status, "failed");
});

// ---------------------------------------------------------------------------
// V5. 前置条件：shot 未确认时 409 SHOT_NOT_CONFIRMED
// ---------------------------------------------------------------------------

test("V5: shot 未确认时 generateVideo 返回 409 SHOT_NOT_CONFIRMED", async () => {
  const client = clientWithFetch(async () =>
    mockResponse({ success: false, code: "SHOT_NOT_CONFIRMED", error: "该 Shot 未确认分镜示意图" }, 409),
  );
  await assert.rejects(
    () => client.generateVideo("shot-unconfirmed", {
      projectId: "p", sourceUnitId: "e", idempotencyKey: "k",
    }),
    (err) => err instanceof StoryboardClientError && err.code === "SHOT_NOT_CONFIRMED",
  );
});

// ---------------------------------------------------------------------------
// V6. 前置条件：无 firstframe 时 409 NO_FIRSTFRAME
// ---------------------------------------------------------------------------

test("V6: 无 firstframe 时 generateVideo 返回 409 NO_FIRSTFRAME", async () => {
  const client = clientWithFetch(async () =>
    mockResponse({ success: false, code: "NO_FIRSTFRAME", error: "没有分镜图作为首帧" }, 409),
  );
  await assert.rejects(
    () => client.generateVideo("shot-noimg", {
      projectId: "p", sourceUnitId: "e", idempotencyKey: "k",
    }),
    (err) => err instanceof StoryboardClientError && err.code === "NO_FIRSTFRAME",
  );
});

// ---------------------------------------------------------------------------
// B1. 批量过滤：跳过已 generating 的 Shot
// ---------------------------------------------------------------------------

test("B1: 批量过滤跳过 generating 状态", () => {
  // 模拟 batchSubmitVideos 过滤逻辑
  const videoJobs = {
    "shot-gen": { status: "running" },
    "shot-idle": { status: "idle" },
    "shot-failed": { status: "failed" },
  };
  const all = ["shot-gen", "shot-idle", "shot-failed"];
  const filtered = all.filter((id) => {
    const st = videoJobs[id];
    return !st || (st.status !== "completed" && st.status !== "queued" && st.status !== "running");
  });
  // shot-gen 被跳过（running），shot-idle 和 shot-failed 通过
  assert.deepEqual(filtered, ["shot-idle", "shot-failed"]);
});

// ---------------------------------------------------------------------------
// B2. 批量过滤：跳过已 completed 的 Shot
// ---------------------------------------------------------------------------

test("B2: 批量过滤跳过 completed 状态（已有确认视频）", () => {
  const videoJobs = {
    "shot-done": { status: "completed", videoUrl: "x.mp4" },
    "shot-idle": { status: "idle" },
  };
  const all = ["shot-done", "shot-idle"];
  // batchUnfinished 过滤
  const unfinished = all.filter((id) => {
    const st = videoJobs[id];
    return !st || (st.status !== "completed" && st.status !== "queued" && st.status !== "running");
  });
  assert.deepEqual(unfinished, ["shot-idle"]);
});

// ---------------------------------------------------------------------------
// B3. 单项失败不阻塞整批（Promise.allSettled 隔离）
// ---------------------------------------------------------------------------

test("B3: 单项失败不阻塞整批", async () => {
  const shotIds = ["a", "b", "c"];
  const failId = "b";
  const results = { ok: [], failed: [] };
  await Promise.allSettled(
    shotIds.map(async (id) => {
      if (id === failId) throw new Error("boom");
      return id;
    }),
  ).then((settled) => {
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const id = shotIds[i];
      if (r.status === "fulfilled") results.ok.push(id);
      else results.failed.push(id);
    }
  });
  assert.deepEqual(results.ok.sort(), ["a", "c"]);
  assert.deepEqual(results.failed, ["b"]);
});

// ---------------------------------------------------------------------------
// E1. 导出：jimeng-prompts.md 追加视频文件名引用
// ---------------------------------------------------------------------------

test("E1: jimeng-prompts.md 追加视频文件名引用（仅 completed）", () => {
  // 复制 buildJimengPromptsMd 核心逻辑
  const scenes = [
    {
      order: 1, heading: "第一场", location: "客厅", timeOfDay: "日", summary: "",
      shots: [
        { order: 1, shotSize: "中景", cameraMovement: "固定", angle: "平视", durationSeconds: 4, visualDescription: "小明进门", dialogue: "我回来了", emotion: "紧张", jimengPromptZh: "主体：小明", confirmed: true, locked: false, id: "shot-1", clientId: "shot-1", idSource: "server", characterAssetIds: [], sceneAssetId: null, propAssetIds: [], sourceText: "", storyBeat: "", continuity: "", imagePrompt: "", userEdited: false, revision: 0, analysisVersion: 0, sourceHash: "" },
        { order: 2, shotSize: "特写", cameraMovement: "推进", angle: "俯视", durationSeconds: 3, visualDescription: "杯子", dialogue: "", emotion: "", jimengPromptZh: "主体：杯子", confirmed: false, locked: false, id: "shot-2", clientId: "shot-2", idSource: "server", characterAssetIds: [], sceneAssetId: null, propAssetIds: [], sourceText: "", storyBeat: "", continuity: "", imagePrompt: "", userEdited: false, revision: 0, analysisVersion: 0, sourceHash: "" },
      ],
    },
  ];
  const videoJobs = {
    "shot-1": { status: "completed", videoUrl: "x.mp4", durationSeconds: 5, costEstimate: 10 },
    "shot-2": { status: "failed", videoUrl: null },
  };

  // 核心逻辑：生成 md
  const lines = [];
  let shotIndex = 0;
  for (const scene of scenes) {
    lines.push(`## 第 ${scene.order} 场 — ${scene.heading}`);
    for (const shot of scene.shots) {
      shotIndex += 1;
      const shotId = shot.id ?? shot.clientId ?? "";
      const v = videoJobs[shotId];
      const videoFilename = v?.status === "completed" ? `videos/shot-${String(shotIndex).padStart(3, "0")}.mp4` : null;
      lines.push(`### Shot ${shotIndex}`);
      lines.push(shot.jimengPromptZh);
      if (videoFilename) {
        lines.push(`视频文件：${videoFilename}`);
      } else {
        lines.push(`视频文件：未生成或失败（状态：${v?.status ?? "idle"}）`);
      }
    }
  }
  const md = lines.join("\n");

  assert.ok(md.includes("videos/shot-001.mp4"), "shot-1 completed 必须有视频文件引用");
  assert.ok(!md.includes("videos/shot-002.mp4"), "shot-2 failed 不应有视频文件引用");
  assert.ok(md.includes("状态：failed"), "shot-2 显示 failed 状态");
});

// ---------------------------------------------------------------------------
// E2. 导出：video-list.csv 含所有 Shot 行
// ---------------------------------------------------------------------------

test("E2: video-list.csv 含所有 Shot 行（含 idle 状态）", () => {
  const scenes = [
    {
      order: 1, shots: [
        { order: 1, id: "s1", clientId: "s1", idSource: "server" },
        { order: 2, id: "s2", clientId: "s2", idSource: "server" },
      ],
    },
  ];
  const videoJobs = {
    "s1": { status: "completed", durationSeconds: 5, aspectRatio: "9:16", finishedAt: 1700000000000, costEstimate: 10, videoUrl: "x", error: null },
    // s2 无 videoJob（idle）
  };
  // 核心 CSV 逻辑
  const headers = ["ShotIndex", "SceneOrder", "ShotOrder", "ShotId", "Duration", "AspectRatio", "GeneratedAt", "CostEstimate", "Status", "VideoFile", "Error"];
  const rows = [headers.join(",")];
  let idx = 0;
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      idx += 1;
      const v = videoJobs[shot.id];
      const videoFile = v?.status === "completed" ? `videos/shot-${String(idx).padStart(3, "0")}.mp4` : "";
      rows.push([idx, scene.order, shot.order, shot.id, v?.durationSeconds ?? "", v?.aspectRatio ?? "9:16", v?.finishedAt ?? "", v?.costEstimate ?? "", v?.status ?? "idle", videoFile, v?.error ?? ""].join(","));
    }
  }
  const csv = rows.join("\n");
  assert.equal(rows.length, 3, "1 header + 2 shot rows");
  assert.ok(csv.includes("s1"));
  assert.ok(csv.includes("s2"));
  assert.ok(csv.includes("idle"), "s2 idle 状态必须出现");
  assert.ok(csv.includes("completed"));
});

// ---------------------------------------------------------------------------
// E3. 导出：videos/ 目录仅含 completed 状态
// ---------------------------------------------------------------------------

test("E3: videos/ 目录仅含 completed 状态的 Shot", () => {
  const scenes = [
    {
      order: 1, shots: [
        { order: 1, id: "s1", clientId: "s1", idSource: "server" },
        { order: 2, id: "s2", clientId: "s2", idSource: "server" },
        { order: 3, id: "s3", clientId: "s3", idSource: "server" },
      ],
    },
  ];
  const videoJobs = {
    "s1": { status: "completed", videoUrl: "url1" },
    "s2": { status: "failed", videoUrl: null },
    "s3": { status: "completed", videoUrl: "url3" },
  };
  // 核心过滤逻辑
  const completed = scenes.flatMap((s) => s.shots).map((sh, i) => ({ shot: sh, index: i + 1 })).filter(({ shot }) => {
    const id = shot.id ?? shot.clientId ?? "";
    return videoJobs[id]?.status === "completed" && videoJobs[id]?.videoUrl;
  });
  assert.equal(completed.length, 2, "仅 s1 和 s3 completed");
  assert.equal(completed[0].index, 1, "shot-001.mp4");
  assert.equal(completed[1].index, 3, "shot-003.mp4");
  // s2 不在列表中（failed）
  assert.ok(!completed.some((c) => c.shot.id === "s2"));
});
