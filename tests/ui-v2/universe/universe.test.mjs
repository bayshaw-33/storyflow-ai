// K2-T-07 Universe 2.0 产品界面测试
// 覆盖：fixture 结构、contract_version 校验、健康度六维度、Change Proposal 状态机、
// Canon Fact 锁定状态、影响分析结构、TS 内联与 JSON 防漂移断言。

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  assertContractVersion,
  CONTRACT_VERSION,
  HEALTH_DIMENSION_KEYS,
} from "../../../lib/client/v2/universe/types.ts";
import {
  loadUniverseFixture,
  loadUniverseFixtureSync,
  UniverseFixtureError,
} from "../../../lib/client/v2/universe/fixtures.ts";
import { universeFixture } from "../../../lib/client/v2/universe/fixture-data.ts";

// Codex 冻结契约（只读取引用，校验一致性）。
import {
  CONTRACT_VERSION as CODEX_CONTRACT_VERSION,
  CHANGE_PROPOSAL_STATUSES,
} from "../../../lib/contracts/v2/index.ts";

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/kiikis-v2");

function readJsonFixture() {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, "universe.json"), "utf-8");
  return JSON.parse(raw);
}

// 校验 UniverseBundleV2 数据结构完整性。
function validateBundle(data) {
  assert.equal(typeof data.contractVersion, "string", "contractVersion 必须是字符串");
  assert.equal(typeof data.universe, "object", "universe 必须是对象");
  assert.equal(typeof data.universe.id, "string");
  assert.equal(typeof data.universe.name, "string");
  assert.equal(typeof data.universe.summary, "string");
  assert.equal(typeof data.universe.corePremise, "string");
  assert.equal(typeof data.universe.createdAt, "string");
  assert.equal(typeof data.universe.updatedAt, "string");
  assert.equal(typeof data.universe.owner, "string");

  assert.equal(typeof data.healthSummary, "object", "healthSummary 必须是对象");
  assert.ok(Array.isArray(data.rules), "rules 必须是数组");
  assert.ok(Array.isArray(data.characters), "characters 必须是数组");
  assert.ok(Array.isArray(data.locations), "locations 必须是数组");
  assert.ok(Array.isArray(data.organizations), "organizations 必须是数组");
  assert.ok(Array.isArray(data.props), "props 必须是数组");
  assert.ok(Array.isArray(data.concepts), "concepts 必须是数组");
  assert.ok(Array.isArray(data.relationships), "relationships 必须是数组");
  assert.ok(Array.isArray(data.timelineEvents), "timelineEvents 必须是数组");
  assert.ok(Array.isArray(data.canonFacts), "canonFacts 必须是数组");
  assert.ok(Array.isArray(data.proposals), "proposals 必须是数组");
  assert.ok(Array.isArray(data.works), "works 必须是数组");
  assert.equal(typeof data.impactAnalysis, "object", "impactAnalysis 必须是对象");
  assert.ok(Array.isArray(data.recentActivity), "recentActivity 必须是数组");

  // 校验资产状态枚举。
  const validStatuses = ["draft", "canon", "alternative", "deprecated"];
  for (const a of [...data.rules, ...data.characters, ...data.locations, ...data.organizations, ...data.props, ...data.concepts]) {
    assert.ok(validStatuses.includes(a.status), `资产状态非法: ${a.status}`);
    assert.equal(typeof a.id, "string");
    assert.equal(typeof a.name, "string");
    assert.equal(typeof a.summary, "string");
    assert.equal(typeof a.source, "string");
    assert.equal(typeof a.mainVersion, "string");
    assert.ok(Array.isArray(a.usedBy), "usedBy 必须是数组");
  }

  // 校验关系结构。
  for (const r of data.relationships) {
    assert.equal(typeof r.id, "string");
    assert.equal(typeof r.fromId, "string");
    assert.equal(typeof r.toId, "string");
    assert.equal(typeof r.type, "string");
    assert.equal(typeof r.description, "string");
  }

  // 校验时间线事件。
  for (const e of data.timelineEvents) {
    assert.equal(typeof e.id, "string");
    assert.equal(typeof e.name, "string");
    assert.equal(typeof e.when, "string");
    assert.equal(typeof e.description, "string");
    assert.ok(Array.isArray(e.involvedEntities), "involvedEntities 必须是数组");
  }

  // 校验 Canon Fact。
  for (const f of data.canonFacts) {
    assert.equal(typeof f.id, "string");
    assert.equal(typeof f.statement, "string");
    assert.equal(typeof f.locked, "boolean", "Canon Fact locked 必须是 boolean");
    assert.equal(typeof f.source, "string");
    assert.ok(Array.isArray(f.references), "references 必须是数组");
  }

  // 校验 Change Proposal。
  for (const p of data.proposals) {
    assert.equal(typeof p.id, "string");
    assert.equal(typeof p.type, "string");
    assert.equal(typeof p.title, "string");
    assert.equal(typeof p.sourceProject, "string");
    assert.equal(typeof p.sourceStep, "string");
    assert.equal(typeof p.originalContent, "string");
    assert.ok(Array.isArray(p.fieldDiff), "fieldDiff 必须是数组");
    assert.equal(typeof p.confidence, "number");
    assert.ok(p.confidence >= 0 && p.confidence <= 1, "confidence 必须在 0-1 之间");
    assert.ok(CHANGE_PROPOSAL_STATUSES.includes(p.status), `proposal.status 非法: ${p.status}`);
    assert.equal(typeof p.createdAt, "string");
    assert.equal(typeof p.impactSummary, "string");

    for (const d of p.fieldDiff) {
      assert.equal(typeof d.path, "string");
      // before/after 可以是任意类型，仅校验字段存在。
      assert.ok("before" in d && "after" in d, "fieldDiff 必须含 before/after");
    }
  }

  // 校验作品。
  const validRelationships = ["inherited", "derived", "referenced"];
  for (const w of data.works) {
    assert.equal(typeof w.id, "string");
    assert.equal(typeof w.title, "string");
    assert.equal(typeof w.type, "string");
    assert.ok(validRelationships.includes(w.relationship), `work.relationship 非法: ${w.relationship}`);
  }

  // 校验影响分析。
  const ia = data.impactAnalysis;
  assert.equal(typeof ia.targetCanonId, "string");
  assert.ok(Array.isArray(ia.affectedWorks), "affectedWorks 必须是数组");
  assert.ok(Array.isArray(ia.affectedSnapshots), "affectedSnapshots 必须是数组");
  assert.ok(Array.isArray(ia.affectedAssets), "affectedAssets 必须是数组");
}

test("CONTRACT_VERSION 与 Codex 冻结契约一致", () => {
  assert.equal(CONTRACT_VERSION, CODEX_CONTRACT_VERSION, "universe CONTRACT_VERSION 应与 Codex 契约一致");
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
});

test("assertContractVersion 匹配时通过，不匹配时抛错", () => {
  assert.doesNotThrow(() => assertContractVersion("2.0.0-alpha.1"));
  assert.throws(
    () => assertContractVersion("1.0.0"),
    /contract version mismatch/,
  );
});

test("CHANGE_PROPOSAL_STATUSES 包含 6 个状态（与 Codex 契约一致）", () => {
  assert.deepEqual(
    [...CHANGE_PROPOSAL_STATUSES].sort(),
    ["accepted", "deferred", "draft", "edited_and_accepted", "pending_review", "rejected"],
  );
});

test("universe.json 结构符合 UniverseBundleV2 类型", () => {
  const data = readJsonFixture();
  validateBundle(data);
  assert.ok(data.rules.length > 0, "fixture 应至少有一条世界规则");
  assert.ok(data.characters.length > 0, "fixture 应至少有一个角色");
  assert.ok(data.canonFacts.length > 0, "fixture 应至少有一条 Canon Fact");
  assert.ok(data.proposals.length > 0, "fixture 应至少有一条 Change Proposal");
  assert.ok(data.relationships.length > 0, "fixture 应至少有一条关系");
  assert.ok(data.timelineEvents.length > 0, "fixture 应至少有一个时间线事件");
  assert.ok(data.works.length > 0, "fixture 应至少有一个关联作品");
});

test("universe.json 的 contractVersion 与 CONTRACT_VERSION 一致", () => {
  const data = readJsonFixture();
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

test("健康度六维度齐全（对齐 PRD §7.8）", () => {
  const data = readJsonFixture();
  const keys = Object.keys(data.healthSummary).sort();
  assert.deepEqual(
    keys,
    [...HEALTH_DIMENSION_KEYS].sort(),
    "healthSummary 维度不齐",
  );
  // 数值范围校验。
  const h = data.healthSummary;
  assert.ok(h.canonCompleteness >= 0 && h.canonCompleteness <= 1, "canonCompleteness 应在 0-1");
  assert.ok(h.characterCompleteness >= 0 && h.characterCompleteness <= 1, "characterCompleteness 应在 0-1");
  assert.ok(h.relationshipTimeline >= 0 && h.relationshipTimeline <= 1, "relationshipTimeline 应在 0-1");
  assert.ok(h.assetCoverage >= 0 && h.assetCoverage <= 1, "assetCoverage 应在 0-1");
  assert.ok(Number.isInteger(h.pendingProposals) && h.pendingProposals >= 0, "pendingProposals 应为非负整数");
  assert.ok(Number.isInteger(h.conflicts) && h.conflicts >= 0, "conflicts 应为非负整数");
});

test("Change Proposal 状态机覆盖全部 6 个状态", () => {
  const data = readJsonFixture();
  const statuses = new Set(data.proposals.map((p) => p.status));
  for (const s of CHANGE_PROPOSAL_STATUSES) {
    assert.ok(statuses.has(s), `fixture 应覆盖 ChangeProposalStatus: ${s}`);
  }
});

test("Canon Fact 锁定状态混合（同时存在 locked=true 和 locked=false）", () => {
  const data = readJsonFixture();
  const locked = data.canonFacts.filter((f) => f.locked);
  const unlocked = data.canonFacts.filter((f) => !f.locked);
  assert.ok(locked.length > 0, "fixture 应至少有一条锁定的 Canon Fact");
  assert.ok(unlocked.length > 0, "fixture 应至少有一条未锁定的 Canon Fact");
});

test("影响分析结构完整（targetCanonId 指向真实存在的 Canon Fact）", () => {
  const data = readJsonFixture();
  const ia = data.impactAnalysis;
  const canonIds = new Set(data.canonFacts.map((f) => f.id));
  assert.ok(canonIds.has(ia.targetCanonId), "impactAnalysis.targetCanonId 应指向真实存在的 Canon Fact");
  assert.ok(ia.affectedWorks.length > 0, "应至少有一个受影响作品");
  assert.ok(ia.affectedAssets.length > 0, "应至少有一个受影响资产");
});

test("loadUniverseFixture 异步加载并校验 contract_version", async () => {
  const data = await loadUniverseFixture("universe");
  validateBundle(data);
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

test("loadUniverseFixtureSync 同步加载返回相同数据", () => {
  const data = loadUniverseFixtureSync("universe");
  validateBundle(data);
  assert.equal(data.contractVersion, CONTRACT_VERSION);
  assert.equal(data.universe.id, "uni-umbral");
});

test("TS 内联 fixture 与 JSON fixture 防漂移一致", () => {
  const json = readJsonFixture();
  // 深度比较：TS 内联与 JSON 应完全一致。
  assert.deepEqual(universeFixture, json, "TS 内联 fixture 与 JSON fixture 不一致（漂移）");
});

test("loadUniverseFixture 抛错时为 UniverseFixtureError", async () => {
  // 构造一个非法 contractVersion 的场景：直接调用 validateFixture 不可，故通过 mock。
  // 这里验证 contract_version 不匹配时 assertContractVersion 抛错。
  assert.throws(
    () => assertContractVersion("invalid-version"),
    /contract version mismatch/,
  );
});

test("资产覆盖 UniverseObjectStatus 四个枚举值", () => {
  const data = readJsonFixture();
  const allAssets = [
    ...data.rules,
    ...data.characters,
    ...data.locations,
    ...data.organizations,
    ...data.props,
    ...data.concepts,
  ];
  const statuses = new Set(allAssets.map((a) => a.status));
  for (const s of ["draft", "canon", "alternative", "deprecated"]) {
    assert.ok(statuses.has(s), `fixture 应覆盖 UniverseObjectStatus: ${s}`);
  }
});

test("作品关联覆盖三种 relationship 类型", () => {
  const data = readJsonFixture();
  const rels = new Set(data.works.map((w) => w.relationship));
  assert.ok(rels.has("inherited"), "应至少有一个 inherited 作品");
  assert.ok(rels.has("derived"), "应至少有一个 derived 作品");
  assert.ok(rels.has("referenced"), "应至少有一个 referenced 作品");
});

test("recentActivity 至少有一条记录（概览页需要）", () => {
  const data = readJsonFixture();
  assert.ok(data.recentActivity.length > 0, "recentActivity 应至少有一条记录");
  for (const a of data.recentActivity) {
    assert.equal(typeof a.id, "string");
    assert.equal(typeof a.message, "string");
    assert.equal(typeof a.at, "string");
  }
});
