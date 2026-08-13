/**
 * tests/screenplay-handoff-api.test.mjs
 * K21-HO-001..004: handoff 服务 + API 适配层
 * 用注入 fetcher mock PostgREST 行为，不连真实数据库。
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  createHandoff,
  getHandoff,
  listHandoffs,
  listHandoffsByEpisode,
  confirmHandoff,
  ScreenplayHandoffError,
} = await import("../lib/server/v2/screenplay-handoffs/index.ts");

const { hashHandoffContentSync } = await import("../lib/screenplay-handoff/hash.ts");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "proj-umbral-ep06";
const UNIVERSE_ID = "uni-umbral-001";
const EPISODE_ID = "ep-06";

function validInput(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    universeId: UNIVERSE_ID,
    episodeId: EPISODE_ID,
    episodeNo: 6,
    episodeTitle: "The Threshold",
    sourceUnitId: "unit-06",
    sourceVersion: "v3",
    screenplayFormat: "international_production",
    screenplayLanguage: "en",
    dialogueLanguage: "en",
    canonSnapshot: {
      characters: [
        { id: "char-isa", name: "Isa", masterVersion: "v2", assetVersion: "v1" },
      ],
      locations: [{ id: "loc-threshold", name: "Threshold Room", masterVersion: "v1" }],
      props: [],
    },
    scenes: [
      {
        id: "scene-06-01",
        sceneNo: 1,
        heading: "INT. THRESHOLD ROOM - NIGHT",
        location: "Threshold Room",
        interiorExterior: "INT",
        timeOfDay: "NIGHT",
        characters: ["char-isa"],
        continuityMode: "NEW",
        precedingTransition: null,
        succeedingTransition: "CUT TO:",
        blocks: [
          { id: "blk-1", type: "action", character: "", text: "Isa enters.", translation: "" },
        ],
      },
    ],
    ...overrides,
  };
}

function makeRow(overrides = {}) {
  const input = validInput();
  const payload = {
    schemaVersion: "kiikis.screenplay-handoff/1",
    projectId: input.projectId,
    universeId: input.universeId,
    episodeId: input.episodeId,
    episodeNo: input.episodeNo,
    episodeTitle: input.episodeTitle,
    sourceUnitId: input.sourceUnitId,
    sourceVersion: input.sourceVersion,
    aspectRatio: "9:16",
    screenplayFormat: input.screenplayFormat,
    screenplayLanguage: input.screenplayLanguage,
    dialogueLanguage: input.dialogueLanguage,
    canonSnapshot: input.canonSnapshot,
    scenes: input.scenes,
  };
  const sourceHash = hashHandoffContentSync(payload);
  return {
    id: "handoff-1",
    owner_id: USER_ID,
    project_id: input.projectId,
    universe_id: input.universeId,
    episode_id: input.episodeId,
    episode_no: input.episodeNo,
    episode_title: input.episodeTitle,
    source_unit_id: input.sourceUnitId,
    source_version: input.sourceVersion,
    source_hash: sourceHash,
    aspect_ratio: "9:16",
    screenplay_format: input.screenplayFormat,
    screenplay_language: input.screenplayLanguage,
    dialogue_language: input.dialogueLanguage,
    canon_snapshot: input.canonSnapshot,
    content_json: { schemaVersion: "kiikis.screenplay-handoff/1", scenes: input.scenes },
    confirmed_by: null,
    confirmed_at: null,
    created_at: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

function makeCreateFetcher(returnRow, opts = {}) {
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (opts.throwOn && path.includes(opts.throwOn)) {
      throw new Error(opts.throwMsg || "network down");
    }
    if (path.includes("/rpc/create_screenplay_handoff")) {
      if (opts.rpcThrows) throw new Error(opts.rpcThrows);
      return returnRow;
    }
    if (path.includes("/rpc/confirm_screenplay_handoff")) {
      return { ...returnRow, confirmed_by: USER_ID, confirmed_at: "2026-08-13T11:00:00.000Z" };
    }
    if (path.includes("/storyflow_screenplay_handoffs")) {
      if (opts.listRows) return opts.listRows;
      return [returnRow];
    }
    throw new Error(`unexpected path: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

// ============================================================
// K21-HO-001: createHandoff 创建不可变 handoff
// ============================================================

test("K21-HO-001: createHandoff 成功创建并返回 handoff", async () => {
  const row = makeRow();
  const fetcher = makeCreateFetcher(row);
  const result = await createHandoff({
    fetcher,
    userId: USER_ID,
    input: validInput(),
  });

  assert.ok(result.handoff);
  assert.equal(result.handoff.schemaVersion, "kiikis.screenplay-handoff/1");
  assert.equal(result.handoff.aspectRatio, "9:16");
  assert.equal(result.handoff.projectId, PROJECT_ID);
  assert.equal(result.handoff.scenes.length, 1);

  // RPC 被调用
  const rpcCall = fetcher.calls.find((c) => c.path.includes("/rpc/create_screenplay_handoff"));
  assert.ok(rpcCall);
  const body = JSON.parse(rpcCall.init.body);
  assert.equal(body.p_owner_id, USER_ID);
  assert.equal(body.p_project_id, PROJECT_ID);
  assert.ok(body.p_source_hash.startsWith("sha256:"));
  assert.equal(body.p_aspect_ratio, "9:16");
});

test("K21-HO-001: createHandoff 未认证 — 抛 unauthenticated", async () => {
  await assert.rejects(
    () => createHandoff({ fetcher: makeCreateFetcher(makeRow()), userId: "", input: validInput() }),
    (err) => err instanceof ScreenplayHandoffError && err.code === "unauthenticated"
  );
});

test("K21-HO-001: createHandoff 无效输入 — 抛 validation_failed", async () => {
  const fetcher = makeCreateFetcher(makeRow());
  await assert.rejects(
    () =>
      createHandoff({
        fetcher,
        userId: USER_ID,
        input: validInput({ aspectRatio: "16:9", projectId: "" }),
      }),
    (err) => err instanceof ScreenplayHandoffError && err.code === "validation_failed"
  );
});

// ============================================================
// K21-HO-003: 幂等创建 — 相同 source_hash 返回已有行
// ============================================================

test("K21-HO-003: createHandoff 幂等 — 相同 source_hash 返回已有行", async () => {
  const row = makeRow();
  const fetcher = makeCreateFetcher(row);

  // 第一次创建
  const r1 = await createHandoff({ fetcher, userId: USER_ID, input: validInput() });

  // 第二次相同输入 (模拟幂等命中, RPC 返回相同行)
  const r2 = await createHandoff({ fetcher, userId: USER_ID, input: validInput() });

  // 两次返回的 sourceHash 相同
  assert.equal(r1.handoff.sourceHash, r2.handoff.sourceHash);
  assert.equal(r1.handoff.id, r2.handoff.id);
});

test("K21-HO-003: createHandoff 不同 sourceVersion — 产生不同 sourceHash", async () => {
  const fetcher1 = makeCreateFetcher(makeRow());
  await createHandoff({
    fetcher: fetcher1,
    userId: USER_ID,
    input: validInput({ sourceVersion: "v3" }),
  });

  const fetcher2 = makeCreateFetcher(makeRow());
  await createHandoff({
    fetcher: fetcher2,
    userId: USER_ID,
    input: validInput({ sourceVersion: "v4" }),
  });

  // 验证 RPC 调用中发送的 sourceHash 不同
  const rpc1 = fetcher1.calls.find((c) => c.path.includes("/rpc/create_screenplay_handoff"));
  const rpc2 = fetcher2.calls.find((c) => c.path.includes("/rpc/create_screenplay_handoff"));
  const hash1 = JSON.parse(rpc1.init.body).p_source_hash;
  const hash2 = JSON.parse(rpc2.init.body).p_source_hash;

  assert.notEqual(hash1, hash2);
});

// ============================================================
// K21-HO-004: fetcher 错误传播
// ============================================================

test("K21-HO-004: createHandoff fetcher 抛错 — 传播 service_unavailable", async () => {
  const fetcher = makeCreateFetcher(makeRow(), {
    throwOn: "/rpc/create_screenplay_handoff",
    throwMsg: "database down",
  });
  await assert.rejects(
    () => createHandoff({ fetcher, userId: USER_ID, input: validInput() }),
    (err) => err instanceof ScreenplayHandoffError && err.code === "service_unavailable"
  );
});

// ============================================================
// getHandoff
// ============================================================

test("getHandoff 成功返回 handoff", async () => {
  const row = makeRow();
  const fetcher = makeCreateFetcher(row);
  const handoff = await getHandoff({ fetcher, userId: USER_ID, handoffId: "handoff-1" });

  assert.equal(handoff.id, undefined); // id 在 parsed 中不直接暴露 (通过 row id)
  assert.equal(handoff.projectId, PROJECT_ID);
  assert.equal(handoff.scenes.length, 1);

  // 查询路径正确
  const listCall = fetcher.calls.find((c) => c.path.includes("/storyflow_screenplay_handoffs"));
  assert.ok(listCall.path.includes("id=eq.handoff-1"));
  assert.ok(listCall.path.includes(`owner_id=eq.${USER_ID}`));
});

test("getHandoff 不存在 — 抛 not_found", async () => {
  const fetcher = makeCreateFetcher(makeRow(), { listRows: [] });
  await assert.rejects(
    () => getHandoff({ fetcher, userId: USER_ID, handoffId: "nonexistent" }),
    (err) => err instanceof ScreenplayHandoffError && err.code === "not_found"
  );
});

// ============================================================
// listHandoffs
// ============================================================

test("listHandoffs 按 projectId 列出", async () => {
  const rows = [makeRow(), makeRow({ id: "handoff-2" })];
  const fetcher = makeCreateFetcher(makeRow(), { listRows: rows });
  const result = await listHandoffs({ fetcher, userId: USER_ID, projectId: PROJECT_ID });

  assert.equal(result.items.length, 2);
  const listCall = fetcher.calls.find((c) => c.path.includes("/storyflow_screenplay_handoffs"));
  assert.ok(listCall.path.includes(`project_id=eq.${PROJECT_ID}`));
  assert.ok(listCall.path.includes("order=created_at.desc"));
});

// ============================================================
// listHandoffsByEpisode
// ============================================================

test("listHandoffsByEpisode 按 episodeId 列出", async () => {
  const fetcher = makeCreateFetcher(makeRow(), { listRows: [makeRow()] });
  const result = await listHandoffsByEpisode({ fetcher, userId: USER_ID, episodeId: EPISODE_ID });

  assert.equal(result.items.length, 1);
  const listCall = fetcher.calls.find((c) => c.path.includes("/storyflow_screenplay_handoffs"));
  assert.ok(listCall.path.includes(`episode_id=eq.${EPISODE_ID}`));
});

// ============================================================
// confirmHandoff
// ============================================================

test("confirmHandoff 成功确认 — confirmedBy 被填充", async () => {
  const fetcher = makeCreateFetcher(makeRow());
  const handoff = await confirmHandoff({ fetcher, userId: USER_ID, handoffId: "handoff-1" });

  assert.equal(handoff.confirmedBy, USER_ID);

  const rpcCall = fetcher.calls.find((c) => c.path.includes("/rpc/confirm_screenplay_handoff"));
  assert.ok(rpcCall);
  const body = JSON.parse(rpcCall.init.body);
  assert.equal(body.p_handoff_id, "handoff-1");
  assert.equal(body.p_confirmed_by, USER_ID);
});

test("confirmHandoff 不存在 — 抛 not_found", async () => {
  const fetcher = makeCreateFetcher(null);
  // RPC 返回 null (确认失败)
  const customFetcher = async (path) => {
    if (path.includes("/rpc/confirm_screenplay_handoff")) return null;
    throw new Error("unexpected");
  };
  await assert.rejects(
    () => confirmHandoff({ fetcher: customFetcher, userId: USER_ID, handoffId: "nonexistent" }),
    (err) => err instanceof ScreenplayHandoffError && err.code === "not_found"
  );
});

// ============================================================
// 跨项目读取隔离
// ============================================================

test("getHandoff 只能读自己的 handoff (owner_id 过滤)", async () => {
  // 其他用户的 handoff
  const otherRow = makeRow({ owner_id: OTHER_USER_ID });
  const fetcher = makeCreateFetcher(otherRow, { listRows: [] });

  await assert.rejects(
    () => getHandoff({ fetcher, userId: USER_ID, handoffId: "handoff-other" }),
    (err) => err instanceof ScreenplayHandoffError && err.code === "not_found"
  );

  // 查询路径包含 owner_id 过滤
  const listCall = fetcher.calls.find((c) => c.path.includes("/storyflow_screenplay_handoffs"));
  assert.ok(listCall.path.includes(`owner_id=eq.${USER_ID}`));
});

// ============================================================
// RPC 返回 null
// ============================================================

test("createHandoff RPC 返回 null — 抛 service_unavailable", async () => {
  const fetcher = async () => null;
  await assert.rejects(
    () => createHandoff({ fetcher, userId: USER_ID, input: validInput() }),
    (err) => err instanceof ScreenplayHandoffError && err.code === "service_unavailable"
  );
});
