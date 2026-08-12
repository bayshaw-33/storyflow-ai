// K2-T-08 短剧样板工作流接入测试：
// - fixture 数据结构符合 ShortDramaData 类型
// - contract_version 校验（引用 Codex 冻结契约）
// - 5 阶段状态机（locked 阶段不能跳过前置）
// - 资产跨阶段传递（剧本确认的角色出现在美术阶段资产列表）
// - 中断恢复（recoveryPoint 恢复到正确阶段）
// - 回流候选生成（完成后 proposals 非空）
// - 导出 partial failure（缺失关键内容时标记，不伪造完整）
// - 防漂移断言：TS 内联与 JSON 一致
// 参考 tests/ui-v2/workbench-shell/workbench-shell.test.mjs 写法。

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  assertContractVersion,
  CONTRACT_VERSION,
} from "../../../lib/client/v2/short-drama/types.ts";
import {
  loadShortDramaFixture,
  getRawShortDramaFixture,
  ShortDramaFixtureError,
} from "../../../lib/client/v2/short-drama/fixtures.ts";
import { shortDramaFixture } from "../../../lib/client/v2/short-drama/fixture-data.ts";
import {
  STAGE_ORDER,
  advanceStage,
  buildAssetFlow,
  buildRecoveryPoint,
  canEnterStage,
  deriveShotsFromStoryboard,
  generateProposals,
  getCurrentStage,
  getStageCompletion,
  getStageDenialReason,
  getStageStatusList,
  isFlowCompleted,
  restoreFromRecoveryPoint,
  transferAssetsToArt,
  validateFlowStages,
} from "../../../lib/client/v2/short-drama/flow-machine.ts";
import {
  buildExportPackages,
  getExportStats,
  isExportComplete,
  isTemporaryUrl,
} from "../../../lib/client/v2/short-drama/export-manifest.ts";

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/kiikis-v2");
const FIXTURE_PATH = path.join(FIXTURE_DIR, "short-drama.json");

function readJsonFixture() {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// 合法的阶段状态
const VALID_STAGE_STATUSES = ["completed", "current", "locked", "available"];
// 合法的候选 kind
const VALID_CANDIDATE_KINDS = ["character", "scene", "prop"];
// 合法的导出包状态
const VALID_PACKAGE_STATUSES = ["ready", "missing", "partial"];
// 合法的 ChangeProposalStatus（对齐契约）
const VALID_PROPOSAL_STATUSES = [
  "draft", "pending_review", "accepted", "edited_and_accepted", "rejected", "deferred",
];

// 校验 fixture 数据结构符合 ShortDramaData 类型。
function validateShortDramaData(data) {
  assert.equal(typeof data.contractVersion, "string", "contractVersion 必须是字符串");
  assert.equal(typeof data.project, "object", "project 必须是对象");
  assert.equal(typeof data.universeBinding, "object", "universeBinding 必须是对象");
  assert.equal(typeof data.stages, "object", "stages 必须是对象");
  assert.ok(Array.isArray(data.assetFlow), "assetFlow 必须是数组");
  assert.ok(Array.isArray(data.proposals), "proposals 必须是数组");
  assert.equal(typeof data.recoveryPoint, "object", "recoveryPoint 必须是对象");

  // project
  const p = data.project;
  assert.equal(typeof p.id, "string");
  assert.equal(typeof p.title, "string");
  assert.equal(typeof p.workflowType, "string");
  assert.ok(STAGE_ORDER.includes(p.currentStage), `currentStage 非法: ${p.currentStage}`);
  assert.equal(typeof p.lastSavedAt, "string");

  // universeBinding
  const u = data.universeBinding;
  assert.equal(typeof u.bound, "boolean");

  // stages: 5 个阶段齐全
  for (const stageId of STAGE_ORDER) {
    assert.ok(stageId in data.stages, `缺少阶段: ${stageId}`);
    assert.ok(VALID_STAGE_STATUSES.includes(data.stages[stageId].status), `stage ${stageId}.status 非法`);
  }

  // script 阶段
  const script = data.stages.script;
  assert.equal(typeof script.script, "string");
  assert.equal(typeof script.analysis, "object");
  assert.ok(Array.isArray(script.analysis.characters));
  assert.ok(Array.isArray(script.analysis.scenes));
  assert.ok(Array.isArray(script.analysis.props));
  assert.equal(typeof script.confirmed, "object");
  assert.ok(Array.isArray(script.confirmed.characterIds));
  assert.ok(Array.isArray(script.confirmed.sceneIds));
  assert.ok(Array.isArray(script.confirmed.propIds));
  for (const c of [...script.analysis.characters, ...script.analysis.scenes, ...script.analysis.props]) {
    assert.equal(typeof c.id, "string");
    assert.equal(typeof c.name, "string");
    assert.ok(VALID_CANDIDATE_KINDS.includes(c.kind), `candidate.kind 非法: ${c.kind}`);
    assert.equal(typeof c.summary, "string");
  }

  // art 阶段
  const art = data.stages.art;
  assert.ok(Array.isArray(art.assets));
  assert.ok(Array.isArray(art.pendingConfirm));
  for (const a of art.assets) {
    assert.equal(typeof a.id, "string");
    assert.equal(typeof a.name, "string");
    assert.ok(VALID_CANDIDATE_KINDS.includes(a.type), `art.type 非法: ${a.type}`);
    assert.equal(typeof a.sourceCandidateId, "string");
    assert.ok(Array.isArray(a.versions));
    assert.ok(a.mainVersionId === null || typeof a.mainVersionId === "string");
    for (const v of a.versions) {
      assert.equal(typeof v.id, "string");
      assert.equal(typeof v.url, "string");
      assert.equal(typeof v.locked, "boolean");
    }
  }

  // storyboard 阶段
  const sb = data.stages.storyboard;
  assert.ok(Array.isArray(sb.frames));
  for (const f of sb.frames) {
    assert.equal(typeof f.id, "string");
    assert.equal(typeof f.sceneRef, "string");
    assert.equal(typeof f.shotDescription, "string");
    assert.equal(typeof f.confirmed, "boolean");
  }

  // video 阶段
  const vid = data.stages.video;
  assert.ok(Array.isArray(vid.shots));
  for (const s of vid.shots) {
    assert.equal(typeof s.id, "string");
    assert.equal(typeof s.frameRef, "string");
    assert.ok(["completed", "failed", "pending"].includes(s.status), `shot.status 非法: ${s.status}`);
  }

  // export 阶段
  const exp = data.stages.export;
  assert.ok(Array.isArray(exp.packages));
  for (const pkg of exp.packages) {
    assert.equal(typeof pkg.id, "string");
    assert.equal(typeof pkg.kind, "string");
    assert.equal(typeof pkg.label, "string");
    assert.ok(VALID_PACKAGE_STATUSES.includes(pkg.status), `package.status 非法: ${pkg.status}`);
    assert.equal(typeof pkg.contentRef, "string");
  }

  // assetFlow
  for (const f of data.assetFlow) {
    assert.equal(typeof f.candidateId, "string");
    assert.equal(typeof f.name, "string");
    assert.ok(VALID_CANDIDATE_KINDS.includes(f.kind));
    assert.ok(Array.isArray(f.flow));
    for (const stageId of f.flow) {
      assert.ok(STAGE_ORDER.includes(stageId), `flow stageId 非法: ${stageId}`);
    }
  }

  // proposals
  for (const prop of data.proposals) {
    assert.equal(typeof prop.id, "string");
    assert.equal(typeof prop.universeId, "string");
    assert.equal(typeof prop.sourceProjectId, "string");
    assert.ok(STAGE_ORDER.includes(prop.sourceStage));
    assert.ok(VALID_PROPOSAL_STATUSES.includes(prop.status), `proposal.status 非法: ${prop.status}`);
    assert.equal(typeof prop.confidence, "number");
    assert.ok(Array.isArray(prop.fieldDiffs));
    assert.equal(typeof prop.createdAt, "string");
  }

  // recoveryPoint
  const rp = data.recoveryPoint;
  assert.ok(STAGE_ORDER.includes(rp.stage));
  assert.equal(typeof rp.confirmedAssets, "object");
  assert.equal(typeof rp.lastSavedAt, "string");
}

// ─── contract_version 校验 ───

test("CONTRACT_VERSION 与 Codex 冻结契约一致", () => {
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
});

test("assertContractVersion 匹配时通过，不匹配时抛错", () => {
  assert.doesNotThrow(() => assertContractVersion("2.0.0-alpha.1"));
  assert.throws(() => assertContractVersion("1.0.0"), /invalid_contract_version/);
});

test("short-drama.json 的 contractVersion 与 CONTRACT_VERSION 一致", () => {
  const data = readJsonFixture();
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

// ─── fixture 数据结构 ───

test("short-drama.json 结构符合 ShortDramaData 类型", () => {
  const data = readJsonFixture();
  validateShortDramaData(data);
  assert.ok(data.stages.script.analysis.characters.length > 0, "fixture 应有角色候选");
  assert.ok(data.stages.script.analysis.scenes.length > 0, "fixture 应有场景候选");
  assert.ok(data.stages.script.analysis.props.length > 0, "fixture 应有道具候选");
});

test("loadShortDramaFixture 返回正确数据且做 contract 校验", () => {
  const data = loadShortDramaFixture();
  validateShortDramaData(data);
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

test("loadShortDramaFixture 返回深拷贝（修改不影响原数据）", () => {
  const d1 = loadShortDramaFixture();
  d1.project.title = "modified";
  const d2 = loadShortDramaFixture();
  assert.notEqual(d2.project.title, "modified", "应返回深拷贝");
});

test("loadShortDramaFixture 未知名称抛 ShortDramaFixtureError", () => {
  assert.throws(
    () => loadShortDramaFixture("unknown"),
    (err) => {
      assert.ok(err instanceof ShortDramaFixtureError);
      assert.equal(err.code, "SHORT_DRAMA_FIXTURE_NOT_FOUND");
      return true;
    },
  );
});

test("fixture 覆盖 5 个阶段", () => {
  const data = loadShortDramaFixture();
  assert.equal(STAGE_ORDER.length, 5);
  for (const stageId of STAGE_ORDER) {
    assert.ok(stageId in data.stages, `应覆盖阶段: ${stageId}`);
  }
});

test("fixture 样板项目标题与工作流类型正确", () => {
  const data = loadShortDramaFixture();
  assert.equal(data.project.title, "样板短剧 EP01");
  assert.equal(data.project.workflowType, "drama");
});

test("fixture universe 绑定正确", () => {
  const data = loadShortDramaFixture();
  assert.equal(data.universeBinding.bound, true);
  assert.equal(data.universeBinding.universeId, "uni-demo");
  assert.equal(data.universeBinding.universeName, "样板宇宙");
});

// ─── 防漂移：TS 内联与 JSON 一致 ───

test("防漂移：TS 内联 fixture 与 JSON 完全一致", () => {
  const json = readJsonFixture();
  const ts = getRawShortDramaFixture();
  assert.deepEqual(ts, json, "TS 内联数据与 JSON 不一致，可能漂移");
});

test("防漂移：shortDramaFixture export 与 getRawShortDramaFixture 一致", () => {
  assert.deepEqual(shortDramaFixture, getRawShortDramaFixture());
});

// ─── 5 阶段状态机 ───

test("STAGE_ORDER 顺序为 script→art→storyboard→video→export", () => {
  assert.deepEqual(STAGE_ORDER, ["script", "art", "storyboard", "video", "export"]);
});

test("fixture 阶段状态通过状态机校验", () => {
  const data = loadShortDramaFixture();
  const result = validateFlowStages(data.stages);
  assert.equal(result.valid, true, `fixture 阶段状态不合法: ${result.reason}`);
});

test("validateFlowStages: 多个 current 不合法", () => {
  const stages = {
    script: { status: "current", script: "", analysis: { characters: [], scenes: [], props: [] }, confirmed: { characterIds: [], sceneIds: [], propIds: [] } },
    art: { status: "current", assets: [], pendingConfirm: [] },
    storyboard: { status: "locked", frames: [] },
    video: { status: "locked", shots: [] },
    export: { status: "locked", packages: [] },
  };
  const result = validateFlowStages(stages);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "multiple_current");
});

test("validateFlowStages: locked 前置 completed 不合法（锁定无意义）", () => {
  const stages = {
    script: { status: "completed", script: "x", analysis: { characters: [], scenes: [], props: [] }, confirmed: { characterIds: [], sceneIds: [], propIds: [] } },
    art: { status: "completed", assets: [], pendingConfirm: [] },
    storyboard: { status: "locked", frames: [] },
    video: { status: "locked", shots: [] },
    export: { status: "locked", packages: [] },
  };
  const result = validateFlowStages(stages);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "locked_after_completed_predecessor");
});

test("canEnterStage: locked 不可进入，completed/current/available 可进入", () => {
  const data = loadShortDramaFixture();
  // fixture: script=completed, art=current, storyboard/video/export=locked
  assert.equal(canEnterStage(data.stages, "script"), true);
  assert.equal(canEnterStage(data.stages, "art"), true);
  assert.equal(canEnterStage(data.stages, "storyboard"), false, "locked 阶段不可进入");
  assert.equal(canEnterStage(data.stages, "video"), false, "locked 阶段不可进入");
  assert.equal(canEnterStage(data.stages, "export"), false, "locked 阶段不可进入");
});

test("locked 阶段不能跳过前置：storyboard 在 art 未完成时锁定", () => {
  const data = loadShortDramaFixture();
  const reason = getStageDenialReason(data.stages, "storyboard", "zh-CN");
  assert.ok(reason, "locked 阶段应有拒绝原因");
  assert.ok(reason.includes("美术"), "拒绝原因应提示先完成美术阶段");
});

test("getStageDenialReason: 非锁定阶段返回 null", () => {
  const data = loadShortDramaFixture();
  assert.equal(getStageDenialReason(data.stages, "script", "zh-CN"), null);
  assert.equal(getStageDenialReason(data.stages, "art", "zh-CN"), null);
});

test("getCurrentStage: 返回 current 状态阶段", () => {
  const data = loadShortDramaFixture();
  assert.equal(getCurrentStage(data.stages), "art");
});

test("getStageStatusList: 返回 5 个阶段状态", () => {
  const data = loadShortDramaFixture();
  const list = getStageStatusList(data.stages);
  assert.equal(list.length, 5);
  assert.deepEqual(list.map((s) => s.id), STAGE_ORDER);
});

test("advanceStage: 当前阶段 completed，下一阶段 current", () => {
  const data = loadShortDramaFixture();
  // art(current) → completed, storyboard(locked) → current
  const advanced = advanceStage(data.stages);
  assert.equal(advanced.art.status, "completed");
  assert.equal(advanced.storyboard.status, "current");
  // video/export 保持 locked
  assert.equal(advanced.video.status, "locked");
  assert.equal(advanced.export.status, "locked");
});

test("advanceStage: 最后阶段推进后保持 completed", () => {
  // 构造全部 completed 的阶段
  const stages = {
    script: { status: "completed", script: "x", analysis: { characters: [], scenes: [], props: [] }, confirmed: { characterIds: [], sceneIds: [], propIds: [] } },
    art: { status: "completed", assets: [], pendingConfirm: [] },
    storyboard: { status: "completed", frames: [] },
    video: { status: "completed", shots: [] },
    export: { status: "current", packages: [] },
  };
  const advanced = advanceStage(stages);
  assert.equal(advanced.export.status, "completed");
});

test("isFlowCompleted: 全部 completed 时为 true", () => {
  const stages = {
    script: { status: "completed", script: "x", analysis: { characters: [], scenes: [], props: [] }, confirmed: { characterIds: [], sceneIds: [], propIds: [] } },
    art: { status: "completed", assets: [], pendingConfirm: [] },
    storyboard: { status: "completed", frames: [] },
    video: { status: "completed", shots: [] },
    export: { status: "completed", packages: [] },
  };
  assert.equal(isFlowCompleted(stages), true);
  // fixture 未全部完成
  const data = loadShortDramaFixture();
  assert.equal(isFlowCompleted(data.stages), false);
});

// ─── 资产跨阶段传递 ───

test("transferAssetsToArt: 剧本确认的候选传递到美术阶段", () => {
  const data = loadShortDramaFixture();
  const transferred = transferAssetsToArt(data.stages.script);
  // fixture 确认了 2 角色 + 2 场景 + 2 道具 = 6 个候选
  assert.equal(transferred.length, 6);
  const transferredIds = new Set(transferred.map((c) => c.id));
  assert.ok(transferredIds.has("char-linwan"));
  assert.ok(transferredIds.has("char-suhe"));
  assert.ok(transferredIds.has("scene-cafe"));
  assert.ok(transferredIds.has("prop-watch"));
});

test("资产跨阶段传递：剧本确认的角色出现在美术阶段资产列表", () => {
  const data = loadShortDramaFixture();
  // 美术资产应来自剧本确认的候选
  for (const asset of data.stages.art.assets) {
    const confirmedIds = [
      ...data.stages.script.confirmed.characterIds,
      ...data.stages.script.confirmed.sceneIds,
      ...data.stages.script.confirmed.propIds,
    ];
    assert.ok(
      confirmedIds.includes(asset.sourceCandidateId),
      `美术资产 ${asset.name} 的 sourceCandidateId 应来自剧本确认候选`,
    );
  }
  // 林晚（char-linwan）在剧本确认 → 应有美术资产
  const linwanArt = data.stages.art.assets.find((a) => a.sourceCandidateId === "char-linwan");
  assert.ok(linwanArt, "剧本确认的角色林晚应有对应美术资产");
  assert.equal(linwanArt.type, "character");
});

test("buildAssetFlow: 记录候选流经阶段", () => {
  const data = loadShortDramaFixture();
  const flow = buildAssetFlow(data);
  assert.ok(flow.length > 0);
  // 林晚流经 script → art
  const linwanFlow = flow.find((f) => f.candidateId === "char-linwan");
  assert.ok(linwanFlow);
  assert.deepEqual(linwanFlow.flow, ["script", "art"]);
  // 银色怀表仅流经 script（无美术资产）
  const watchFlow = flow.find((f) => f.candidateId === "prop-watch");
  assert.ok(watchFlow);
  assert.deepEqual(watchFlow.flow, ["script"]);
});

// ─── 中断恢复 ───

test("buildRecoveryPoint: 记录当前阶段与已确认资产", () => {
  const data = loadShortDramaFixture();
  const rp = buildRecoveryPoint(data);
  assert.equal(rp.stage, "art");
  assert.deepEqual(rp.confirmedAssets.characterIds, ["char-linwan", "char-suhe"]);
  assert.deepEqual(rp.confirmedAssets.sceneIds, ["scene-cafe", "scene-street"]);
  assert.deepEqual(rp.confirmedAssets.propIds, ["prop-watch", "prop-letter"]);
  assert.equal(typeof rp.lastSavedAt, "string");
});

test("restoreFromRecoveryPoint: 恢复到正确阶段", () => {
  const data = loadShortDramaFixture();
  // 模拟中断在 storyboard 阶段（art 已完成）
  const recovery = {
    stage: "storyboard",
    confirmedAssets: data.recoveryPoint.confirmedAssets,
    lastSavedAt: data.recoveryPoint.lastSavedAt,
  };
  // 先推进 art 到 completed
  const advanced = advanceStage(data.stages); // art→completed, storyboard→current
  const restored = restoreFromRecoveryPoint(advanced, recovery);
  // 恢复点 stage=storyboard 应为 current
  assert.equal(restored.storyboard.status, "current");
  // 前置 art 应为 completed
  assert.equal(restored.art.status, "completed");
  // script 应为 completed
  assert.equal(restored.script.status, "completed");
  // 后置 video/export 应为 locked（storyboard 未完成）
  assert.equal(restored.video.status, "locked");
  assert.equal(restored.export.status, "locked");
});

test("restoreFromRecoveryPoint: 恢复到 art 阶段", () => {
  const data = loadShortDramaFixture();
  const restored = restoreFromRecoveryPoint(data.stages, data.recoveryPoint);
  assert.equal(restored.art.status, "current");
  assert.equal(restored.script.status, "completed");
  assert.equal(restored.storyboard.status, "locked");
});

// ─── 回流候选生成 ───

test("generateProposals: 剧本完成后生成非空候选", () => {
  const data = loadShortDramaFixture();
  const proposals = generateProposals(data);
  assert.ok(proposals.length > 0, "剧本完成后应有回流候选");
  // 每个候选状态为 draft 或 pending_review（不自动改写 Canon）
  for (const p of proposals) {
    assert.ok(
      p.status === "draft" || p.status === "pending_review",
      `proposal.status 应为 draft/pending_review，实际: ${p.status}`,
    );
    assert.equal(p.universeId, "uni-demo");
  }
});

test("generateProposals: 全部完成后 proposals 非空且补充视频证据候选", () => {
  // 构造全部 completed 的数据
  const data = loadShortDramaFixture();
  const allCompleted = {
    ...data,
    stages: {
      script: { ...data.stages.script, status: "completed" },
      art: { ...data.stages.art, status: "completed" },
      storyboard: { ...data.stages.storyboard, status: "completed" },
      video: {
        ...data.stages.video,
        status: "completed",
        shots: [
          { id: "shot-1", frameRef: "frame-001", status: "completed", url: "/assets/video/shot-1.mp4" },
          { id: "shot-2", frameRef: "frame-002", status: "completed", url: "/assets/video/shot-2.mp4" },
        ],
      },
      export: { ...data.stages.export, status: "completed" },
    },
  };
  const proposals = generateProposals(allCompleted);
  assert.ok(proposals.length > 0, "全部完成后 proposals 应非空");
  // 应包含来自 script 的候选
  assert.ok(proposals.some((p) => p.sourceStage === "script"));
  // 应包含来自 video 的候选
  assert.ok(proposals.some((p) => p.sourceStage === "video"), "应有视频证据候选");
});

test("回流候选不自动改写 Canon：状态为 draft 或 pending_review", () => {
  const data = loadShortDramaFixture();
  for (const p of data.proposals) {
    assert.ok(
      p.status === "draft" || p.status === "pending_review",
      `回流候选不应自动改写 Canon，状态应为 draft/pending_review，实际: ${p.status}`,
    );
  }
});

test("generateProposals: 未绑定 universe 时不生成候选", () => {
  const data = loadShortDramaFixture();
  const unbound = { ...data, universeBinding: { bound: false } };
  const proposals = generateProposals(unbound);
  assert.equal(proposals.length, 0, "未绑定 universe 不应生成回流候选");
});

// ─── 导出 partial failure ───

test("buildExportPackages: 全部就绪时返回 ready 包", () => {
  const stages = {
    script: {
      status: "completed",
      script: "剧本内容",
      analysis: { characters: [], scenes: [], props: [] },
      confirmed: { characterIds: [], sceneIds: [], propIds: [] },
    },
    art: {
      status: "completed",
      assets: [
        {
          id: "art-1", name: "角色", type: "character", sourceCandidateId: "c1",
          versions: [{ id: "v1", url: "/a.png", locked: true }], mainVersionId: "v1",
        },
      ],
      pendingConfirm: [],
    },
    storyboard: {
      status: "completed",
      frames: [{ id: "f1", sceneRef: "s1", shotDescription: "镜头1", confirmed: true }],
    },
    video: {
      status: "completed",
      shots: [{ id: "shot-1", frameRef: "f1", status: "completed", url: "/v.mp4" }],
    },
    export: { status: "completed", packages: [] },
  };
  const packages = buildExportPackages(stages);
  assert.ok(packages.length === 8, "应有 8 种导出包");
  // 全部 ready
  for (const pkg of packages) {
    assert.equal(pkg.status, "ready", `包 ${pkg.kind} 应为 ready，实际: ${pkg.status}`);
  }
  assert.equal(isExportComplete(packages), true);
});

test("导出 partial failure：缺失关键内容时标记为 missing/partial，不伪造完整", () => {
  // 缺失：无视频镜头、无美术资产、无分镜
  const stages = {
    script: {
      status: "completed",
      script: "",
      analysis: { characters: [], scenes: [], props: [] },
      confirmed: { characterIds: [], sceneIds: [], propIds: [] },
    },
    art: { status: "completed", assets: [], pendingConfirm: [] },
    storyboard: { status: "completed", frames: [] },
    video: { status: "completed", shots: [] },
    export: { status: "completed", packages: [] },
  };
  const packages = buildExportPackages(stages);
  // 剧本为空 → missing
  const scriptPkg = packages.find((p) => p.kind === "script");
  assert.equal(scriptPkg.status, "missing");
  // 视频镜头缺失 → missing
  const videoPkg = packages.find((p) => p.kind === "video_shot");
  assert.equal(videoPkg.status, "missing");
  // 证据包应标记 partial（不伪造完整）
  const evidencePkg = packages.find((p) => p.kind === "evidence");
  assert.equal(evidencePkg.status, "partial", "证据包应标记 partial，不伪造完整");
  assert.ok(evidencePkg.missingReason, "partial 包应有 missingReason");
  assert.equal(isExportComplete(packages), false);
});

test("导出 partial failure：视频镜头部分失败时标记为 partial", () => {
  const stages = {
    script: {
      status: "completed",
      script: "剧本",
      analysis: { characters: [], scenes: [], props: [] },
      confirmed: { characterIds: [], sceneIds: [], propIds: [] },
    },
    art: {
      status: "completed",
      assets: [{
        id: "art-1", name: "角色", type: "character", sourceCandidateId: "c1",
        versions: [{ id: "v1", url: "/a.png", locked: true }], mainVersionId: "v1",
      }],
      pendingConfirm: [],
    },
    storyboard: {
      status: "completed",
      frames: [{ id: "f1", sceneRef: "s1", shotDescription: "x", confirmed: true }],
    },
    video: {
      status: "completed",
      shots: [
        { id: "shot-1", frameRef: "f1", status: "completed", url: "/v1.mp4" },
        { id: "shot-2", frameRef: "f1", status: "failed", failureReason: "超时" },
      ],
    },
    export: { status: "completed", packages: [] },
  };
  const packages = buildExportPackages(stages);
  const videoPkg = packages.find((p) => p.kind === "video_shot");
  assert.equal(videoPkg.status, "partial", "部分镜头失败应标记 partial");
  assert.ok(videoPkg.missingReason.includes("1"), "应提示 1 个镜头未完成");
  const evidencePkg = packages.find((p) => p.kind === "evidence");
  assert.equal(evidencePkg.status, "partial");
});

test("isTemporaryUrl: 识别临时签名 URL", () => {
  assert.equal(isTemporaryUrl("/assets/art/v1.png"), false, "相对路径不是临时 URL");
  assert.equal(isTemporaryUrl("https://cdn.example.com/a.png?expires=123"), true);
  assert.equal(isTemporaryUrl("https://cdn.example.com/a.png?signature=abc"), true);
  assert.equal(isTemporaryUrl("blob:http://localhost/abc"), true);
  assert.equal(isTemporaryUrl("data:image/png;base64,xxx"), true);
});

test("导出包 contentRef 不依赖临时 URL", () => {
  const stages = {
    script: { status: "completed", script: "x", analysis: { characters: [], scenes: [], props: [] }, confirmed: { characterIds: [], sceneIds: [], propIds: [] } },
    art: { status: "completed", assets: [], pendingConfirm: [] },
    storyboard: { status: "completed", frames: [] },
    video: { status: "completed", shots: [] },
    export: { status: "completed", packages: [] },
  };
  const packages = buildExportPackages(stages);
  for (const pkg of packages) {
    assert.equal(isTemporaryUrl(pkg.contentRef), false, `包 ${pkg.kind} contentRef 不应是临时 URL: ${pkg.contentRef}`);
    assert.ok(pkg.contentRef.startsWith("inline://"), "contentRef 应为稳定内联引用");
  }
});

test("getExportStats: 统计导出包状态", () => {
  const packages = [
    { id: "1", kind: "script", label: "a", status: "ready", contentRef: "inline://x" },
    { id: "2", kind: "video_shot", label: "b", status: "partial", contentRef: "inline://x" },
    { id: "3", kind: "subtitle", label: "c", status: "missing", contentRef: "inline://x" },
  ];
  const stats = getExportStats(packages);
  assert.equal(stats.total, 3);
  assert.equal(stats.ready, 1);
  assert.equal(stats.partial, 1);
  assert.equal(stats.missing, 1);
});

// ─── 阶段完成条件 ───

test("getStageCompletion: 剧本阶段完成条件（有剧本+有确认）", () => {
  const data = loadShortDramaFixture();
  const result = getStageCompletion(data.stages, "script");
  assert.equal(result.complete, true, "fixture 剧本阶段应已完成");
  assert.ok(result.nextGuide, "完成后应有下一步引导");
});

test("getStageCompletion: 美术阶段未完成（有 pendingConfirm）", () => {
  const data = loadShortDramaFixture();
  const result = getStageCompletion(data.stages, "art");
  assert.equal(result.complete, false, "fixture 美术阶段应未完成（有待生成候选）");
});

test("getStageCompletion: 剧本无确认时未完成", () => {
  const stages = {
    script: {
      status: "current",
      script: "剧本内容",
      analysis: { characters: [], scenes: [], props: [] },
      confirmed: { characterIds: [], sceneIds: [], propIds: [] },
    },
    art: { status: "locked", assets: [], pendingConfirm: [] },
    storyboard: { status: "locked", frames: [] },
    video: { status: "locked", shots: [] },
    export: { status: "locked", packages: [] },
  };
  const result = getStageCompletion(stages, "script");
  assert.equal(result.complete, false);
  assert.ok(result.reason.includes("候选"));
});

// ─── 分镜转镜头派生 ───

test("deriveShotsFromStoryboard: 已确认帧派生镜头", () => {
  const storyboard = {
    status: "completed",
    frames: [
      { id: "f1", sceneRef: "s1", shotDescription: "a", confirmed: true },
      { id: "f2", sceneRef: "s1", shotDescription: "b", confirmed: false },
      { id: "f3", sceneRef: "s2", shotDescription: "c", confirmed: true },
    ],
  };
  const shots = deriveShotsFromStoryboard(storyboard);
  assert.equal(shots.length, 2, "仅已确认帧派生镜头");
  assert.equal(shots[0].frameRef, "f1");
  assert.equal(shots[1].frameRef, "f3");
  assert.equal(shots[0].status, "pending");
});
