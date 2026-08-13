// K2-I-03 短剧样板端到端接线测试：
// - fixture 结构符合 ShortDramaData 类型（contract_version 校验）
// - buildScriptCandidatesFromSnapshot：从继承快照 payload 正确提取角色/场景/道具候选
// - buildExportAndSubmitPayload：回流 payload 结构正确（idempotencyKey/target/proposedPayload）
// - isE2EComplete：所有阶段完成 + proposals 已生成时返回 true
// - 资产跨阶段传递：剧本确认 → 美术 → 分镜 → 视频（端到端推进）
// - 回流候选生成：完成后 proposals 非空，不自动改写 Canon
// - 导出 partial failure 拒绝临时 URL（contentRef 全部 inline://）
// - mock fetch 验证 API 路径（bind/snapshot/diff/proposals）
// - 错误状态（401/404/500 + 缺 accessToken）
// - recovery 增强：snapshotId 字段 + loadDraftWithSnapshot 云端优先回退本地
//
// 参考 short-drama-flow.test.mjs 写法，import 路径带 .ts 后缀。

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContractVersion,
  CONTRACT_VERSION,
} from "../../../lib/client/v2/short-drama/types.ts";
import { loadShortDramaFixture } from "../../../lib/client/v2/short-drama/fixtures.ts";
import {
  advanceStage,
  buildAssetFlow,
  buildExportAndSubmitPayload,
  buildScriptCandidatesFromSnapshot,
  deriveShotsFromStoryboard,
  generateProposals,
  isE2EComplete,
  isFlowCompleted,
  transferAssetsToArt,
} from "../../../lib/client/v2/short-drama/flow-machine.ts";
import {
  buildExportPackages,
  isExportComplete,
  isTemporaryUrl,
} from "../../../lib/client/v2/short-drama/export-manifest.ts";
import {
  USE_FIXTURE,
  fetchShortDramaFlow,
  fetchShortDramaFlowFromApi,
  bindProjectUniverse,
  createSnapshot,
  diffSnapshot,
  submitProposalsToUniverse,
  ShortDramaApiError,
  SHORT_DRAMA_API_ERROR_CODES,
} from "../../../lib/client/v2/short-drama/api.ts";
import {
  saveDraft,
  loadDraft,
  loadDraftWithSnapshot,
  clearDraft,
} from "../../../lib/client/v2/short-drama/recovery.ts";

// ─── mock fetch 工厂 ───

// 构造伪 Response 对象。
function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  };
}

// 构造记录型 mock fetch：按 url 路由到不同响应。
// 调用方通过 mockFetch.calls 检查请求 url/init。
function createMockFetch(router) {
  const fn = (url, init) => {
    fn.calls.push({ url: String(url), init });
    const handler = router[String(url)];
    if (!handler) {
      return Promise.resolve(mockResponse({ success: false, error: `unexpected url: ${url}`, code: "not_found" }, 404));
    }
    const result = handler(init);
    if (result && typeof result.then === "function") {
      return result.then((r) => r instanceof Object && "status" in r ? r : mockResponse(r));
    }
    return Promise.resolve(result && typeof result === "object" && "status" in result ? result : mockResponse(result));
  };
  fn.calls = [];
  return fn;
}

// ─── mock localStorage（recovery 测试用） ───

function installMockLocalStorage() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  const prevWindow = globalThis.window;
  globalThis.window = { localStorage };
  return {
    localStorage,
    store,
    restore: () => { globalThis.window = prevWindow; },
  };
}

// ─── 共享 fixture ───

// 端到端推进后的"全部完成"数据（用于回流/导出/E2E 完成判断测试）。
function buildAllCompletedData() {
  const data = loadShortDramaFixture();
  return {
    ...data,
    stages: {
      script: { ...data.stages.script, status: "completed" },
      art: {
        ...data.stages.art,
        status: "completed",
        // 把 pendingConfirm 也转为已锁定主版本的资产，使美术阶段完整。
        assets: [
          ...data.stages.art.assets,
          {
            id: "art-street",
            name: "雨夜街角 场景",
            type: "scene",
            sourceCandidateId: "scene-street",
            versions: [{ id: "art-street-v1", url: "/assets/art/street-v1.png", locked: true }],
            mainVersionId: "art-street-v1",
          },
          {
            id: "art-watch",
            name: "银色怀表 道具",
            type: "prop",
            sourceCandidateId: "prop-watch",
            versions: [{ id: "art-watch-v1", url: "/assets/art/watch-v1.png", locked: true }],
            mainVersionId: "art-watch-v1",
          },
          {
            id: "art-letter",
            name: "旧信件 道具",
            type: "prop",
            sourceCandidateId: "prop-letter",
            versions: [{ id: "art-letter-v1", url: "/assets/art/letter-v1.png", locked: true }],
            mainVersionId: "art-letter-v1",
          },
          {
            id: "art-suhe",
            name: "苏河 角色立绘",
            type: "character",
            sourceCandidateId: "char-suhe",
            versions: [{ id: "art-suhe-v1", url: "/assets/art/suhe-v1.png", locked: true }],
            mainVersionId: "art-suhe-v1",
          },
        ],
        pendingConfirm: [],
      },
      storyboard: {
        ...data.stages.storyboard,
        status: "completed",
        frames: [
          { id: "frame-001", sceneRef: "scene-cafe", shotDescription: "林晚窗边摩挲怀表，窗外雨夜", confirmed: true },
          { id: "frame-002", sceneRef: "scene-cafe", shotDescription: "苏河推门进入，带进雨气", confirmed: true },
        ],
      },
      video: {
        ...data.stages.video,
        status: "completed",
        shots: [
          { id: "shot-frame-001", frameRef: "frame-001", status: "completed", url: "/assets/video/shot-1.mp4" },
          { id: "shot-frame-002", frameRef: "frame-002", status: "completed", url: "/assets/video/shot-2.mp4" },
        ],
      },
      export: {
        ...data.stages.export,
        status: "completed",
        packages: buildExportPackages({
          ...data.stages,
          art: {
            ...data.stages.art,
            assets: [
              ...data.stages.art.assets,
              {
                id: "art-street", name: "x", type: "scene", sourceCandidateId: "scene-street",
                versions: [{ id: "v1", url: "/x.png", locked: true }], mainVersionId: "v1",
              },
              {
                id: "art-watch", name: "x", type: "prop", sourceCandidateId: "prop-watch",
                versions: [{ id: "v1", url: "/x.png", locked: true }], mainVersionId: "v1",
              },
              {
                id: "art-letter", name: "x", type: "prop", sourceCandidateId: "prop-letter",
                versions: [{ id: "v1", url: "/x.png", locked: true }], mainVersionId: "v1",
              },
              {
                id: "art-suhe", name: "x", type: "character", sourceCandidateId: "char-suhe",
                versions: [{ id: "v1", url: "/x.png", locked: true }], mainVersionId: "v1",
              },
            ],
          },
          storyboard: {
            ...data.stages.storyboard,
            frames: [
              { id: "frame-001", sceneRef: "scene-cafe", shotDescription: "x", confirmed: true },
              { id: "frame-002", sceneRef: "scene-cafe", shotDescription: "x", confirmed: true },
            ],
          },
          video: {
            ...data.stages.video,
            shots: [
              { id: "shot-1", frameRef: "frame-001", status: "completed", url: "/v1.mp4" },
              { id: "shot-2", frameRef: "frame-002", status: "completed", url: "/v2.mp4" },
            ],
          },
        }),
      },
    },
  };
}

// ─── contract_version 校验 ───

test("CONTRACT_VERSION 与 Codex 冻结契约一致（e2e-wiring）", () => {
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
});

test("assertContractVersion 匹配通过，不匹配抛错", () => {
  assert.doesNotThrow(() => assertContractVersion("2.0.0-alpha.1"));
  assert.throws(() => assertContractVersion("1.0.0"), /invalid_contract_version/);
});

test("fixture 的 contractVersion 与 CONTRACT_VERSION 一致", () => {
  const data = loadShortDramaFixture();
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

// ─── fixture 结构符合类型 ───

test("fixture 结构通过基础校验（stages/proposals/recoveryPoint 齐全）", () => {
  const data = loadShortDramaFixture();
  assert.equal(typeof data.contractVersion, "string");
  assert.equal(typeof data.project, "object");
  assert.equal(typeof data.universeBinding, "object");
  assert.equal(typeof data.stages, "object");
  assert.ok(Array.isArray(data.assetFlow));
  assert.ok(Array.isArray(data.proposals));
  assert.equal(typeof data.recoveryPoint, "object");
  // 5 阶段齐全
  for (const sid of ["script", "art", "storyboard", "video", "export"]) {
    assert.ok(sid in data.stages, `应覆盖阶段: ${sid}`);
  }
});

test("USE_FIXTURE 默认为 true（保持向后兼容）", () => {
  // 测试环境未设置 NEXT_PUBLIC_USE_SHORT_DRAMA_FIXTURE，应为 true。
  assert.equal(USE_FIXTURE, true);
});

test("fetchShortDramaFlow 在 USE_FIXTURE=true 时走 fixture", async () => {
  // USE_FIXTURE 是编译期常量，这里验证 fixture 路径返回正确数据。
  const data = await fetchShortDramaFlow("token", "any-project-id");
  assert.equal(data.contractVersion, CONTRACT_VERSION);
  assert.equal(data.project.id, "proj-drama-ep01");
});

// ─── buildScriptCandidatesFromSnapshot ───

test("buildScriptCandidatesFromSnapshot: 从快照 payload 正确提取 character/location/object 三类候选", () => {
  const snapshot = {
    id: "snap-1",
    projectId: "proj-1",
    universeId: "uni-1",
    universeVersion: "v1",
    includedObjectIds: [],
    createdAt: "2026-08-13T00:00:00+08:00",
    payload: {
      entities: [
        { id: "e-char-1", type: "character", name: "林晚", summary: "女主角", status: "canon", updatedAt: "2026-08-13T00:00:00+08:00" },
        { id: "e-loc-1", type: "location", name: "海边咖啡馆", summary: "窗边位置", status: "canon", updatedAt: "2026-08-13T00:00:00+08:00" },
        { id: "e-obj-1", type: "object", name: "银色怀表", summary: "林晚随身物品", status: "draft", updatedAt: "2026-08-13T00:00:00+08:00" },
        // 其他 type 应被忽略
        { id: "e-rule-1", type: "rule", name: "时间规则", summary: "x", status: "canon", updatedAt: "2026-08-13T00:00:00+08:00" },
        { id: "e-concept-1", type: "concept", name: "概念", summary: "y", status: "canon", updatedAt: "2026-08-13T00:00:00+08:00" },
      ],
    },
  };
  const candidates = buildScriptCandidatesFromSnapshot(snapshot);
  assert.equal(candidates.characters.length, 1);
  assert.equal(candidates.characters[0].id, "e-char-1");
  assert.equal(candidates.characters[0].kind, "character");
  assert.equal(candidates.scenes.length, 1);
  assert.equal(candidates.scenes[0].id, "e-loc-1");
  assert.equal(candidates.scenes[0].kind, "scene");
  assert.equal(candidates.props.length, 1);
  assert.equal(candidates.props[0].id, "e-obj-1");
  assert.equal(candidates.props[0].kind, "prop");
});

test("buildScriptCandidatesFromSnapshot: 接受裸 payload 入参（仅 entities）", () => {
  const payload = {
    entities: [
      { id: "e-1", type: "character", name: "x", summary: "y", status: "canon", updatedAt: "t" },
    ],
  };
  const candidates = buildScriptCandidatesFromSnapshot(payload);
  assert.equal(candidates.characters.length, 1);
});

test("buildScriptCandidatesFromSnapshot: null/undefined/空 payload 返回空三数组", () => {
  for (const input of [null, undefined, { entities: [] }]) {
    const c = buildScriptCandidatesFromSnapshot(input);
    assert.equal(c.characters.length, 0);
    assert.equal(c.scenes.length, 0);
    assert.equal(c.props.length, 0);
  }
});

// ─── buildExportAndSubmitPayload ───

test("buildExportAndSubmitPayload: 全部完成时 inputs 非空，每个 input 结构正确", () => {
  const data = buildAllCompletedData();
  // 重新生成 proposals（基于全完成数据）
  data.proposals = generateProposals(data);
  const payload = buildExportAndSubmitPayload(data);
  assert.ok(payload.inputs.length > 0, "全完成时应生成 inputs");
  for (const input of payload.inputs) {
    assert.equal(typeof input.sourceProjectId, "string");
    assert.equal(typeof input.sourceStep, "string");
    assert.equal(typeof input.idempotencyKey, "string");
    assert.ok(input.idempotencyKey.includes(data.project.id), "idempotencyKey 应包含 projectId");
    assert.ok(Array.isArray(input.fieldDiffs));
    assert.ok(input.target && typeof input.target.objectType === "string");
    assert.equal(typeof input.proposedPayload, "object");
    assert.equal(input.suggestedAction, "review", "suggestedAction 应为 review（不自动 accept）");
    assert.ok(input.confidence >= 0 && input.confidence <= 1);
  }
});

test("buildExportAndSubmitPayload: evidenceRefs 只包含 ready 导出包的 contentRef", () => {
  const data = buildAllCompletedData();
  data.proposals = generateProposals(data);
  const payload = buildExportAndSubmitPayload(data);
  // buildExportPackages 在全完成时所有包 ready，evidenceRefs 应非空。
  assert.ok(payload.evidenceRefs.length > 0);
  for (const ref of payload.evidenceRefs) {
    assert.ok(ref.startsWith("inline://"), `证据引用应为 inline:// 稳定引用: ${ref}`);
    assert.equal(isTemporaryUrl(ref), false, "证据引用不应是临时 URL");
  }
});

test("buildExportAndSubmitPayload: idempotencyKey 派生自 projectId + proposalId（重试幂等）", () => {
  const data = buildAllCompletedData();
  data.proposals = generateProposals(data);
  const payload = buildExportAndSubmitPayload(data);
  const seen = new Set();
  for (const input of payload.inputs) {
    assert.ok(!seen.has(input.idempotencyKey), "idempotencyKey 应唯一");
    seen.add(input.idempotencyKey);
  }
});

// ─── isE2EComplete ───

test("isE2EComplete: 全完成 + proposals 非空时返回 true", () => {
  const data = buildAllCompletedData();
  data.proposals = generateProposals(data);
  assert.equal(isE2EComplete(data), true);
});

test("isE2EComplete: 阶段未完成时返回 false", () => {
  const data = loadShortDramaFixture();
  // fixture 在美术阶段未完成
  assert.equal(isE2EComplete(data), false);
});

test("isE2EComplete: 全完成但 proposals 为空时返回 false", () => {
  const data = buildAllCompletedData();
  data.proposals = [];
  assert.equal(isE2EComplete(data), false);
});

// ─── 资产跨阶段传递：剧本 → 美术 → 分镜 → 视频 ───

test("端到端资产传递：剧本确认候选 → transferAssetsToArt → deriveShotsFromStoryboard", () => {
  const data = loadShortDramaFixture();
  // 剧本确认的候选应传递到美术阶段
  const transferred = transferAssetsToArt(data.stages.script);
  assert.equal(transferred.length, 6, "剧本确认 6 个候选应全部传递");
  // 美术资产应来自剧本确认的候选
  for (const asset of data.stages.art.assets) {
    const confirmedIds = [
      ...data.stages.script.confirmed.characterIds,
      ...data.stages.script.confirmed.sceneIds,
      ...data.stages.script.confirmed.propIds,
    ];
    assert.ok(confirmedIds.includes(asset.sourceCandidateId));
  }
  // 分镜帧引用场景候选
  for (const frame of data.stages.storyboard.frames) {
    const sceneIds = data.stages.script.confirmed.sceneIds;
    assert.ok(sceneIds.includes(frame.sceneRef), `分镜帧 ${frame.id} 应引用已确认场景`);
  }
  // 分镜 → 视频镜头派生
  const confirmedFrames = data.stages.storyboard.frames.filter((f) => f.confirmed);
  // fixture 分镜未确认，先模拟确认
  const confirmedStoryboard = {
    ...data.stages.storyboard,
    frames: data.stages.storyboard.frames.map((f) => ({ ...f, confirmed: true })),
  };
  const shots = deriveShotsFromStoryboard(confirmedStoryboard);
  assert.equal(shots.length, confirmedStoryboard.frames.length, "已确认帧应派生为镜头");
  for (const shot of shots) {
    assert.ok(confirmedStoryboard.frames.some((f) => f.id === shot.frameRef));
    assert.equal(shot.status, "pending");
  }
});

test("端到端推进：剧本→美术→分镜→视频→导出 阶段状态机连贯", () => {
  const data = loadShortDramaFixture();
  // fixture 起点：script=completed, art=current
  assert.equal(data.stages.script.status, "completed");
  assert.equal(data.stages.art.status, "current");
  // 推进 art → storyboard
  let stages = advanceStage(data.stages);
  assert.equal(stages.art.status, "completed");
  assert.equal(stages.storyboard.status, "current");
  // 推进 storyboard → video
  stages = advanceStage(stages);
  assert.equal(stages.storyboard.status, "completed");
  assert.equal(stages.video.status, "current");
  // 推进 video → export
  stages = advanceStage(stages);
  assert.equal(stages.video.status, "completed");
  assert.equal(stages.export.status, "current");
  // 推进 export → 保持 completed（最后阶段）
  stages = advanceStage(stages);
  assert.equal(stages.export.status, "completed");
  assert.equal(isFlowCompleted(stages), true);
});

test("buildAssetFlow: 端到端资产流动记录覆盖 script → art → storyboard → video", () => {
  const data = buildAllCompletedData();
  const flow = buildAssetFlow(data);
  assert.ok(flow.length > 0);
  // 至少有一个候选流经全部 4 个阶段
  const fullFlow = flow.find((f) => f.flow.length === 4);
  assert.ok(fullFlow, "应存在流经 script→art→storyboard→video 的候选");
  assert.deepEqual(fullFlow.flow, ["script", "art", "storyboard", "video"]);
});

// ─── 回流候选生成 ───

test("回流候选生成：全完成后 proposals 非空，状态为 draft/pending_review", () => {
  const data = buildAllCompletedData();
  data.proposals = generateProposals(data);
  assert.ok(data.proposals.length > 0, "全完成后应生成回流候选");
  for (const p of data.proposals) {
    assert.ok(
      p.status === "draft" || p.status === "pending_review",
      `回流候选不自动改写 Canon，状态应为 draft/pending_review，实际: ${p.status}`,
    );
    assert.equal(p.universeId, data.universeBinding.universeId);
    assert.equal(p.sourceProjectId, data.project.id);
  }
});

test("回流候选生成：未绑定 Universe 时不生成候选", () => {
  const data = buildAllCompletedData();
  data.universeBinding = { bound: false };
  data.proposals = generateProposals(data);
  assert.equal(data.proposals.length, 0);
});

// ─── 导出 partial failure 拒绝临时 URL ───

test("导出 partial failure：缺失关键内容时标记 missing/partial，不伪造完整", () => {
  const stages = {
    script: { status: "completed", script: "", analysis: { characters: [], scenes: [], props: [] }, confirmed: { characterIds: [], sceneIds: [], propIds: [] } },
    art: { status: "completed", assets: [], pendingConfirm: [] },
    storyboard: { status: "completed", frames: [] },
    video: { status: "completed", shots: [] },
    export: { status: "completed", packages: [] },
  };
  const packages = buildExportPackages(stages);
  const evidence = packages.find((p) => p.kind === "evidence");
  assert.equal(evidence.status, "partial", "证据包应标记 partial");
  assert.ok(evidence.missingReason);
  assert.equal(isExportComplete(packages), false);
});

test("导出 contentRef 全部 inline://，拒绝临时 URL", () => {
  const stages = {
    script: { status: "completed", script: "x", analysis: { characters: [], scenes: [], props: [] }, confirmed: { characterIds: [], sceneIds: [], propIds: [] } },
    art: { status: "completed", assets: [], pendingConfirm: [] },
    storyboard: { status: "completed", frames: [] },
    video: { status: "completed", shots: [] },
    export: { status: "completed", packages: [] },
  };
  const packages = buildExportPackages(stages);
  for (const pkg of packages) {
    assert.equal(isTemporaryUrl(pkg.contentRef), false, `包 ${pkg.kind} 不应使用临时 URL`);
    assert.ok(pkg.contentRef.startsWith("inline://"), `包 ${pkg.kind} 应使用 inline:// 引用`);
  }
});

test("isTemporaryUrl: 识别各类临时 URL", () => {
  assert.equal(isTemporaryUrl("/assets/art/v1.png"), false);
  assert.equal(isTemporaryUrl("https://cdn.example.com/a.png?expires=123"), true);
  assert.equal(isTemporaryUrl("https://cdn.example.com/a.png?signature=abc"), true);
  assert.equal(isTemporaryUrl("https://cdn.example.com/a.png?X-Amz-Signature=abc"), true);
  assert.equal(isTemporaryUrl("blob:http://localhost/abc"), true);
  assert.equal(isTemporaryUrl("data:image/png;base64,xxx"), true);
});

// ─── mock fetch 验证 API 路径 ───

test("fetchShortDramaFlowFromApi: GET /api/v2/projects/[id]/universe/snapshot", async () => {
  const snapshot = {
    id: "snap-1",
    projectId: "proj-1",
    universeId: "uni-1",
    universeVersion: "v1",
    includedObjectIds: [],
    createdAt: "2026-08-13T00:00:00+08:00",
    payload: {
      entities: [
        { id: "e-1", type: "character", name: "林晚", summary: "女主角", status: "canon", updatedAt: "t" },
      ],
    },
  };
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": () => mockResponse({
      success: true,
      contractVersion: CONTRACT_VERSION,
      snapshot,
    }),
  });
  const data = await fetchShortDramaFlowFromApi("token", "proj-1", { fetchImpl });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, "/api/v2/projects/proj-1/universe/snapshot");
  // 验证快照映射结果
  assert.equal(data.project.id, "proj-1");
  assert.equal(data.universeBinding.bound, true);
  assert.equal(data.universeBinding.universeId, "uni-1");
  assert.equal(data.stages.script.status, "current");
  assert.equal(data.stages.art.status, "locked");
  assert.equal(data.stages.script.analysis.characters.length, 1);
  assert.equal(data.stages.script.analysis.characters[0].name, "林晚");
  assert.equal(data.proposals.length, 0, "初始状态无回流候选");
});

test("fetchShortDramaFlowFromApi: Authorization Bearer header 携带 token", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": () => mockResponse({
      success: true,
      contractVersion: CONTRACT_VERSION,
      snapshot: {
        id: "s", projectId: "proj-1", universeId: "uni-1", universeVersion: "v1",
        includedObjectIds: [], createdAt: "t", payload: { entities: [] },
      },
    }),
  });
  await fetchShortDramaFlowFromApi("my-token", "proj-1", { fetchImpl });
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, "Bearer my-token");
});

test("bindProjectUniverse: POST /api/v2/projects/[id]/universe/bind，body 含 universeId", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/bind": (init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.universeId, "uni-1");
      return mockResponse({
        success: true,
        contractVersion: CONTRACT_VERSION,
        binding: {
          link: {
            id: "link-1", projectId: "proj-1", universeId: "uni-1", role: "main_season",
            settings: {}, boundAt: "t", unboundAt: null,
          },
          created: true,
        },
        snapshot: {
          id: "snap-1", projectId: "proj-1", universeId: "uni-1", universeVersion: "v1",
          includedObjectIds: [], createdAt: "t", payload: { entities: [] },
        },
      });
    },
  });
  const result = await bindProjectUniverse("token", "proj-1", "uni-1", { fetchImpl });
  assert.equal(fetchImpl.calls[0].url, "/api/v2/projects/proj-1/universe/bind");
  assert.equal(fetchImpl.calls[0].init.method, "POST");
  assert.equal(result.binding.created, true);
  assert.equal(result.snapshot.universeId, "uni-1");
});

test("createSnapshot: POST /api/v2/projects/[id]/universe/snapshot", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": (init) => {
      assert.equal(init.method, "POST");
      return mockResponse({
        success: true,
        contractVersion: CONTRACT_VERSION,
        snapshot: {
          id: "snap-2", projectId: "proj-1", universeId: "uni-1", universeVersion: "v2",
          includedObjectIds: [], createdAt: "t", payload: { entities: [] },
        },
      });
    },
  });
  const snapshot = await createSnapshot("token", "proj-1", { fetchImpl });
  assert.equal(snapshot.id, "snap-2");
  assert.equal(fetchImpl.calls[0].url, "/api/v2/projects/proj-1/universe/snapshot");
});

test("diffSnapshot: GET /api/v2/projects/[id]/universe/snapshot/diff", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot/diff": () => mockResponse({
      success: true,
      contractVersion: CONTRACT_VERSION,
      snapshot: {
        id: "snap-1", projectId: "proj-1", universeId: "uni-1", universeVersion: "v1",
        includedObjectIds: [], createdAt: "t", payload: { entities: [] },
      },
      fields: [
        { path: "entities.e-1.name", before: "旧名", after: "新名", impact: "changed" },
      ],
      upgradeRequired: true,
      impacts: [{ path: "entities.e-1.name", reason: "Project snapshot differs from current Universe." }],
    }),
  });
  const result = await diffSnapshot("token", "proj-1", { fetchImpl });
  assert.equal(fetchImpl.calls[0].url, "/api/v2/projects/proj-1/universe/snapshot/diff");
  assert.equal(result.upgradeRequired, true);
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].impact, "changed");
});

test("submitProposalsToUniverse: POST /api/v2/universes/[id]/proposals/batch，body 含 inputs + action=create", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/universes/uni-1/proposals/batch": (init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.action, "create");
      assert.ok(Array.isArray(body.inputs));
      assert.equal(body.inputs.length, 1);
      return mockResponse({
        success: true,
        contractVersion: CONTRACT_VERSION,
        items: [
          {
            id: "prop-1", universeId: "uni-1", sourceProjectId: "proj-1", sourceStep: "script",
            status: "pending_review", confidence: 0.8,
            fieldDiffs: [{ path: "entities.character.林晚", before: null, after: "女主角" }],
            createdAt: "t",
          },
        ],
        createdCount: 1,
      });
    },
  });
  const inputs = [
    {
      sourceProjectId: "proj-1",
      sourceStep: "script",
      originalText: "女主角",
      confidence: 0.8,
      fieldDiffs: [{ path: "entities.character.林晚", before: null, after: "女主角" }],
      suggestedAction: "review",
      idempotencyKey: "short-drama:proj-1:prop-1",
      target: { objectType: "character", objectId: "prop-1" },
      proposedPayload: { name: "林晚", value: "女主角" },
    },
  ];
  const result = await submitProposalsToUniverse("token", "uni-1", inputs, { fetchImpl });
  assert.equal(fetchImpl.calls[0].url, "/api/v2/universes/uni-1/proposals/batch");
  assert.equal(fetchImpl.calls[0].init.method, "POST");
  assert.equal(result.createdCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "pending_review");
});

test("端到端：fetchShortDramaFlowFromApi → buildExportAndSubmitPayload → submitProposalsToUniverse", async () => {
  // 模拟端到端流程：从快照加载 → 推进全完成 → 生成 payload → 提交
  const snapshot = {
    id: "snap-1", projectId: "proj-1", universeId: "uni-1", universeVersion: "v1",
    includedObjectIds: [], createdAt: "t",
    payload: {
      entities: [
        { id: "e-char-1", type: "character", name: "林晚", summary: "女主角", status: "canon", updatedAt: "t" },
        { id: "e-loc-1", type: "location", name: "海边咖啡馆", summary: "场景", status: "canon", updatedAt: "t" },
      ],
    },
  };
  // 1. 加载
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": () => mockResponse({
      success: true, contractVersion: CONTRACT_VERSION, snapshot,
    }),
    "/api/v2/universes/uni-1/proposals/batch": (init) => {
      const body = JSON.parse(init.body);
      return mockResponse({
        success: true, contractVersion: CONTRACT_VERSION,
        items: body.inputs.map((_, i) => ({
          id: `prop-${i}`, universeId: "uni-1", sourceProjectId: "proj-1", sourceStep: "script",
          status: "pending_review", confidence: 0.8, fieldDiffs: [], createdAt: "t",
        })),
        createdCount: body.inputs.length,
      });
    },
  });
  const initialData = await fetchShortDramaFlowFromApi("token", "proj-1", { fetchImpl });
  assert.equal(initialData.stages.script.analysis.characters.length, 1);
  assert.equal(initialData.stages.script.analysis.scenes.length, 1);

  // 2. 模拟用户确认全部候选 + 推进全完成
  const confirmedData = {
    ...initialData,
    stages: {
      ...initialData.stages,
      script: {
        ...initialData.stages.script,
        status: "completed",
        confirmed: {
          characterIds: initialData.stages.script.analysis.characters.map((c) => c.id),
          sceneIds: initialData.stages.script.analysis.scenes.map((c) => c.id),
          propIds: [],
        },
      },
      art: { ...initialData.stages.art, status: "completed", assets: [], pendingConfirm: [] },
      storyboard: { ...initialData.stages.storyboard, status: "completed", frames: [] },
      video: { ...initialData.stages.video, status: "completed", shots: [] },
      export: { ...initialData.stages.export, status: "completed", packages: buildExportPackages({
        script: { ...initialData.stages.script, status: "completed", script: "x", confirmed: { characterIds: ["e-char-1"], sceneIds: ["e-loc-1"], propIds: [] } },
        art: { status: "completed", assets: [], pendingConfirm: [] },
        storyboard: { status: "completed", frames: [] },
        video: { status: "completed", shots: [] },
        export: { status: "completed", packages: [] },
      }) },
    },
  };
  confirmedData.proposals = generateProposals(confirmedData);
  assert.ok(isE2EComplete(confirmedData), "端到端应完成");

  // 3. 生成提交 payload
  const payload = buildExportAndSubmitPayload(confirmedData);
  assert.ok(payload.inputs.length > 0);

  // 4. 提交到 Universe
  const submitResult = await submitProposalsToUniverse("token", "uni-1", payload.inputs, { fetchImpl });
  assert.equal(submitResult.createdCount, payload.inputs.length);
});

// ─── 错误状态（401/404/500 + 缺 accessToken） ───

test("错误状态：缺 accessToken 抛 UNAUTHENTICATED", async () => {
  await assert.rejects(
    () => fetchShortDramaFlowFromApi(null, "proj-1"),
    (err) => {
      assert.ok(err instanceof ShortDramaApiError);
      assert.equal(err.code, SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED);
      return true;
    },
  );
});

test("错误状态：401 响应抛 UNAUTHENTICATED", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": () => mockResponse(
      { success: false, error: "Authentication is required.", code: "unauthenticated" },
      401,
    ),
  });
  await assert.rejects(
    () => fetchShortDramaFlowFromApi("token", "proj-1", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof ShortDramaApiError);
      assert.equal(err.code, SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED);
      assert.equal(err.httpStatus, 401);
      return true;
    },
  );
});

test("错误状态：404 响应抛 NOT_FOUND", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": () => mockResponse(
      { success: false, error: "Inheritance snapshot not found.", code: "not_found" },
      404,
    ),
  });
  await assert.rejects(
    () => fetchShortDramaFlowFromApi("token", "proj-1", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof ShortDramaApiError);
      assert.equal(err.code, SHORT_DRAMA_API_ERROR_CODES.NOT_FOUND);
      assert.equal(err.httpStatus, 404);
      return true;
    },
  );
});

test("错误状态：500 响应抛 SHORT_DRAMA_FETCH_FAILED（fallback code）", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": () => mockResponse(
      { success: false, error: "Internal server error", code: "service_unavailable" },
      500,
    ),
  });
  await assert.rejects(
    () => fetchShortDramaFlowFromApi("token", "proj-1", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof ShortDramaApiError);
      // service_unavailable 映射到 SERVICE_UNAVAILABLE
      assert.equal(err.code, SHORT_DRAMA_API_ERROR_CODES.SERVICE_UNAVAILABLE);
      assert.equal(err.httpStatus, 500);
      return true;
    },
  );
});

test("错误状态：契约版本不匹配抛 SHORT_DRAMA_CONTRACT_MISMATCH", async () => {
  const fetchImpl = createMockFetch({
    "/api/v2/projects/proj-1/universe/snapshot": () => mockResponse({
      success: true,
      contractVersion: "1.0.0-wrong",
      snapshot: {
        id: "s", projectId: "proj-1", universeId: "uni-1", universeVersion: "v1",
        includedObjectIds: [], createdAt: "t", payload: { entities: [] },
      },
    }),
  });
  await assert.rejects(
    () => fetchShortDramaFlowFromApi("token", "proj-1", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof ShortDramaApiError);
      assert.equal(err.code, SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_CONTRACT_MISMATCH);
      return true;
    },
  );
});

test("错误状态：submitProposalsToUniverse 缺 inputs 抛 VALIDATION_FAILED", async () => {
  await assert.rejects(
    () => submitProposalsToUniverse("token", "uni-1", []),
    (err) => {
      assert.ok(err instanceof ShortDramaApiError);
      assert.equal(err.code, SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED);
      return true;
    },
  );
});

test("isUnauthenticatedError / isNotFoundError 工具函数", async () => {
  const { isUnauthenticatedError, isNotFoundError } = await import("../../../lib/client/v2/short-drama/api.ts");
  const unauthErr = new ShortDramaApiError(SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED, "x");
  const notFoundErr = new ShortDramaApiError(SHORT_DRAMA_API_ERROR_CODES.NOT_FOUND, "x");
  const otherErr = new ShortDramaApiError(SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_FETCH_FAILED, "x");
  assert.equal(isUnauthenticatedError(unauthErr), true);
  assert.equal(isUnauthenticatedError(notFoundErr), false);
  assert.equal(isNotFoundError(notFoundErr), true);
  assert.equal(isNotFoundError(otherErr), false);
  assert.equal(isUnauthenticatedError(new Error("plain")), false);
});

// ─── recovery 增强：snapshotId + loadDraftWithSnapshot ───

test("recovery: saveDraft 支持 snapshotId 可选参数", () => {
  const mock = installMockLocalStorage();
  try {
    saveDraft("proj-1", "script", { characterIds: [], sceneIds: [], propIds: [] }, "snap-1");
    const draft = loadDraft("proj-1");
    assert.ok(draft);
    assert.equal(draft.snapshotId, "snap-1");
    assert.equal(draft.cloudSynced, false, "草稿 cloudSynced 仍为 false（不伪装同步）");
  } finally {
    mock.restore();
  }
});

test("recovery: saveDraft 不传 snapshotId 时为 null（向后兼容）", () => {
  const mock = installMockLocalStorage();
  try {
    saveDraft("proj-1", "script", { characterIds: [], sceneIds: [], propIds: [] });
    const draft = loadDraft("proj-1");
    assert.ok(draft);
    assert.equal(draft.snapshotId, null);
  } finally {
    mock.restore();
  }
});

test("recovery: 旧版草稿（无 snapshotId 字段）仍能正常 load", () => {
  const mock = installMockLocalStorage();
  try {
    // 手动写入旧格式草稿（无 snapshotId）
    const oldDraft = {
      contractVersion: CONTRACT_VERSION,
      projectId: "proj-1",
      stage: "script",
      confirmedAssets: { characterIds: [], sceneIds: [], propIds: [] },
      savedAt: new Date().toISOString(),
      cloudSynced: false,
    };
    mock.localStorage.setItem("kiikis:v2:short-drama:draft:proj-1", JSON.stringify(oldDraft));
    const draft = loadDraft("proj-1");
    assert.ok(draft);
    assert.equal(draft.stage, "script");
    // snapshotId 字段为 undefined（向后兼容）
    assert.equal(draft.snapshotId, undefined);
  } finally {
    mock.restore();
  }
});

test("loadDraftWithSnapshot: 云端快照成功时 source=cloud", async () => {
  const mock = installMockLocalStorage();
  try {
    // 本地先存一份草稿
    saveDraft("proj-1", "art", { characterIds: ["c1"], sceneIds: [], propIds: [] });
    const fetchSnapshot = async () => ({
      id: "snap-cloud",
      projectId: "proj-1",
      universeId: "uni-1",
      universeVersion: "v1",
      includedObjectIds: [],
      createdAt: "t",
      payload: { entities: [] },
    });
    const result = await loadDraftWithSnapshot("proj-1", fetchSnapshot);
    assert.equal(result.source, "cloud");
    assert.ok(result.snapshot);
    assert.equal(result.snapshot.id, "snap-cloud");
    // 本地草稿也返回（供参考）
    assert.ok(result.draft);
    assert.equal(result.draft.stage, "art");
  } finally {
    mock.restore();
  }
});

test("loadDraftWithSnapshot: 云端失败回退本地草稿 source=local", async () => {
  const mock = installMockLocalStorage();
  try {
    saveDraft("proj-1", "script", { characterIds: [], sceneIds: [], propIds: [] });
    const fetchSnapshot = async () => {
      throw new Error("network error");
    };
    const result = await loadDraftWithSnapshot("proj-1", fetchSnapshot);
    assert.equal(result.source, "local");
    assert.equal(result.snapshot, null);
    assert.ok(result.draft);
    assert.equal(result.draft.stage, "script");
  } finally {
    mock.restore();
  }
});

test("loadDraftWithSnapshot: 云端返回 null 回退本地草稿", async () => {
  const mock = installMockLocalStorage();
  try {
    saveDraft("proj-1", "script", { characterIds: [], sceneIds: [], propIds: [] });
    const fetchSnapshot = async () => null;
    const result = await loadDraftWithSnapshot("proj-1", fetchSnapshot);
    assert.equal(result.source, "local");
    assert.equal(result.snapshot, null);
  } finally {
    mock.restore();
  }
});

test("loadDraftWithSnapshot: 无 fetchSnapshot 直接走本地", async () => {
  const mock = installMockLocalStorage();
  try {
    saveDraft("proj-1", "script", { characterIds: [], sceneIds: [], propIds: [] });
    const result = await loadDraftWithSnapshot("proj-1");
    assert.equal(result.source, "local");
    assert.ok(result.draft);
  } finally {
    mock.restore();
  }
});

test("loadDraftWithSnapshot: 无本地草稿且无云端 source=none", async () => {
  const mock = installMockLocalStorage();
  try {
    const result = await loadDraftWithSnapshot("proj-1");
    assert.equal(result.source, "none");
    assert.equal(result.draft, null);
    assert.equal(result.snapshot, null);
  } finally {
    mock.restore();
  }
});

test("loadDraftWithSnapshot: 云端成功不改写本地草稿 cloudSynced", async () => {
  const mock = installMockLocalStorage();
  try {
    saveDraft("proj-1", "script", { characterIds: [], sceneIds: [], propIds: [] });
    const fetchSnapshot = async () => ({
      id: "snap-cloud", projectId: "proj-1", universeId: "uni-1", universeVersion: "v1",
      includedObjectIds: [], createdAt: "t", payload: { entities: [] },
    });
    await loadDraftWithSnapshot("proj-1", fetchSnapshot);
    // 再次 load 草稿，验证 cloudSynced 仍为 false（未被云端快照改写为已同步）
    const draft = loadDraft("proj-1");
    assert.ok(draft);
    assert.equal(draft.cloudSynced, false, "云端快照成功后，本地草稿 cloudSynced 仍应为 false");
  } finally {
    mock.restore();
  }
});

test("clearDraft: 清除草稿后 loadDraft 返回 null", () => {
  const mock = installMockLocalStorage();
  try {
    saveDraft("proj-1", "script", { characterIds: [], sceneIds: [], propIds: [] });
    assert.ok(loadDraft("proj-1"));
    clearDraft("proj-1");
    assert.equal(loadDraft("proj-1"), null);
  } finally {
    mock.restore();
  }
});
