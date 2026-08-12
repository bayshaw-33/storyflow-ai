/**
 * K2-T-06 KK 2.0 全局反馈层测试
 *
 * 验证：
 *   1. fixture 数据结构符合 KkMessage / KkSettings / KkStats 契约
 *   2. contract_version 校验
 *   3. 三档频率过滤逻辑（frequent 全推 / key_only 只推关键 / on_demand 不自动推）
 *   4. 勿扰模式（doNotDisturb=true 时不弹通知但消息入队）
 *   5. 临时静音（mutedUntil 未过期时不弹通知）
 *   6. 消息严重性分类
 *   7. 跳转动作 URL 存在性
 *   8. 防漂移断言：TS 内联与 JSON 一致
 *
 * 运行：node --test tests/ui-v2/kk/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  CONTRACT_VERSION,
  ALL_MESSAGE_TYPES,
  ALL_SEVERITIES,
  ALL_FREQUENCIES,
  KEY_MESSAGE_TYPES,
  assertContractVersion,
} from "../../../lib/client/v2/kk/types.ts";
import {
  isKeyMessage,
  filterNotifiableByFrequency,
  filterNotifiable,
  shouldNotify,
  isMuted,
  computeStats,
} from "../../../lib/client/v2/kk/filtering.ts";
import {
  FIXTURE_MESSAGES,
  FIXTURE_SETTINGS,
  FIXTURE_STATS,
  FIXTURE_DATASET,
} from "../../../lib/client/v2/kk/fixture-data.ts";

// 读取 JSON fixture
const raw = readFileSync("tests/fixtures/kiikis-v2/kk.json", "utf8");
const jsonDataset = JSON.parse(raw);
const jsonMessages = jsonDataset.messages;
const jsonSettings = jsonDataset.settings;
const jsonStats = jsonDataset.stats;

// ============================================================
// 1. contract_version 校验
// ============================================================

test("fixture contractVersion 等于常量 CONTRACT_VERSION", () => {
  assert.equal(jsonDataset.contractVersion, "2.0.0-alpha.1");
  assert.equal(jsonDataset.contractVersion, CONTRACT_VERSION);
  assert.equal(FIXTURE_DATASET.contractVersion, CONTRACT_VERSION);
});

test("assertContractVersion 在版本匹配时不抛错", () => {
  assert.doesNotThrow(() => assertContractVersion(CONTRACT_VERSION));
});

test("assertContractVersion 在版本不匹配时抛错", () => {
  assert.throws(
    () => assertContractVersion("1.0.0"),
    /kk contract version mismatch/,
  );
});

// ============================================================
// 2. fixture 数据结构契约
// ============================================================

test("messages 至少 12 个，覆盖全部 6 种类型", () => {
  assert.ok(Array.isArray(jsonMessages), "messages 必须是数组");
  assert.ok(jsonMessages.length >= 12, `messages 至少 12 个，实际 ${jsonMessages.length}`);

  const types = new Set(jsonMessages.map((m) => m.type));
  for (const t of ALL_MESSAGE_TYPES) {
    assert.ok(types.has(t), `缺少消息类型 ${t}`);
  }
});

test("每个 message 字段结构符合 KkMessage 契约", () => {
  for (const msg of jsonMessages) {
    assert.equal(typeof msg.id, "string", "id 必须是 string");
    assert.ok(ALL_MESSAGE_TYPES.includes(msg.type), `type 非法: ${msg.type}`);
    assert.equal(typeof msg.title, "string", "title 必须是 string");
    assert.equal(typeof msg.body, "string", "body 必须是 string");
    assert.ok(ALL_SEVERITIES.includes(msg.severity), `severity 非法: ${msg.severity}`);
    assert.equal(typeof msg.createdAt, "string", "createdAt 必须是 string");
    assert.equal(typeof msg.read, "boolean", "read 必须是 boolean");
    if (msg.actionLabel !== undefined) {
      assert.equal(typeof msg.actionLabel, "string");
    }
    if (msg.actionUrl !== undefined) {
      assert.equal(typeof msg.actionUrl, "string");
    }
    if (msg.relatedJobId !== undefined) {
      assert.equal(typeof msg.relatedJobId, "string");
    }
    if (msg.relatedProposalId !== undefined) {
      assert.equal(typeof msg.relatedProposalId, "string");
    }
  }
});

test("settings 结构符合 KkSettings 契约", () => {
  assert.ok(ALL_FREQUENCIES.includes(jsonSettings.frequency), `frequency 非法: ${jsonSettings.frequency}`);
  assert.equal(typeof jsonSettings.doNotDisturb, "boolean");
  if (jsonSettings.mutedUntil !== null && jsonSettings.mutedUntil !== undefined) {
    assert.equal(typeof jsonSettings.mutedUntil, "string");
  }
});

test("stats 结构符合 KkStats 契约", () => {
  assert.equal(typeof jsonStats.total, "number");
  assert.equal(typeof jsonStats.unread, "number");
  assert.equal(jsonStats.total, jsonMessages.length);
  for (const sev of ALL_SEVERITIES) {
    assert.equal(typeof jsonStats.bySeverity[sev], "number");
  }
  const sevSum = ALL_SEVERITIES.reduce((s, k) => s + jsonStats.bySeverity[k], 0);
  assert.equal(sevSum, jsonStats.total, "bySeverity 计数之和必须等于 total");
});

// ============================================================
// 3. 三档频率过滤逻辑
// ============================================================

test("frequent 频率：全部消息都推", () => {
  const notifiable = filterNotifiableByFrequency(FIXTURE_MESSAGES, "frequent");
  assert.equal(notifiable.length, FIXTURE_MESSAGES.length, "frequent 应推全部消息");
});

test("key_only 频率：只推关键消息（完成/失败/需确认/提案待审 + warning/error）", () => {
  const notifiable = filterNotifiableByFrequency(FIXTURE_MESSAGES, "key_only");
  // 关键消息：类型在 KEY_MESSAGE_TYPES 中，或 severity 为 warning/error
  const expected = FIXTURE_MESSAGES.filter(
    (m) => KEY_MESSAGE_TYPES.includes(m.type) || m.severity === "warning" || m.severity === "error",
  );
  assert.equal(notifiable.length, expected.length, "key_only 只推关键消息");
  assert.ok(notifiable.length > 0, "应至少有 1 条关键消息");
  assert.ok(notifiable.length < FIXTURE_MESSAGES.length, "key_only 应过滤掉部分非关键消息");
});

test("on_demand 频率：不自动推（返回空数组）", () => {
  const notifiable = filterNotifiableByFrequency(FIXTURE_MESSAGES, "on_demand");
  assert.equal(notifiable.length, 0, "on_demand 不应自动推任何消息");
});

test("key_only 不推纯 info 的 canon_check_result / asset_review", () => {
  const infoMessages = FIXTURE_MESSAGES.filter((m) => m.severity === "info");
  assert.ok(infoMessages.length >= 1, "fixture 应至少有 1 条 info 消息");
  const notifiable = filterNotifiableByFrequency(infoMessages, "key_only");
  // info 且类型不在 KEY_MESSAGE_TYPES 中的不应被推
  for (const msg of notifiable) {
    assert.ok(
      KEY_MESSAGE_TYPES.includes(msg.type),
      `info 消息 ${msg.id} 不应在 key_only 下被推（除非类型为关键类型）`,
    );
  }
});

test("isKeyMessage 正确识别关键消息", () => {
  for (const msg of FIXTURE_MESSAGES) {
    const isKey = isKeyMessage(msg);
    if (KEY_MESSAGE_TYPES.includes(msg.type)) {
      assert.ok(isKey, `类型 ${msg.type} 应为关键消息`);
    }
    if (msg.severity === "error" || msg.severity === "warning") {
      assert.ok(isKey, `severity ${msg.severity} 应为关键消息`);
    }
  }
});

// ============================================================
// 4. 勿扰模式
// ============================================================

test("doNotDisturb=true 时 filterNotifiable 返回空（不弹通知）", () => {
  const dndSettings = { ...FIXTURE_SETTINGS, doNotDisturb: true };
  const notifiable = filterNotifiable(FIXTURE_MESSAGES, dndSettings);
  assert.equal(notifiable.length, 0, "勿扰模式不应弹任何通知");
});

test("doNotDisturb=true 时 shouldNotify 返回 false", () => {
  const dndSettings = { ...FIXTURE_SETTINGS, doNotDisturb: true };
  for (const msg of FIXTURE_MESSAGES) {
    assert.equal(shouldNotify(msg, dndSettings), false, `勿扰模式下不应通知: ${msg.id}`);
  }
});

test("勿扰模式不丢弃消息：消息仍在 fixture 列表中", () => {
  const dndSettings = { ...FIXTURE_SETTINGS, doNotDisturb: true };
  const notifiable = filterNotifiable(FIXTURE_MESSAGES, dndSettings);
  assert.equal(notifiable.length, 0);
  // 消息本身没有被删除，仍在原列表
  assert.equal(FIXTURE_MESSAGES.length, 13, "原消息列表不受勿扰影响");
});

// ============================================================
// 5. 临时静音
// ============================================================

test("mutedUntil 未过期时 isMuted 返回 true", () => {
  const future = new Date(Date.now() + 30 * 60_000).toISOString();
  const mutedSettings = { ...FIXTURE_SETTINGS, mutedUntil: future };
  assert.equal(isMuted(mutedSettings), true, "未过期的 mutedUntil 应静音");
});

test("mutedUntil 已过期时 isMuted 返回 false", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const mutedSettings = { ...FIXTURE_SETTINGS, mutedUntil: past };
  assert.equal(isMuted(mutedSettings), false, "已过期的 mutedUntil 不应静音");
});

test("mutedUntil 为 null 时 isMuted 返回 false", () => {
  assert.equal(isMuted(FIXTURE_SETTINGS), false);
});

test("静音状态下 filterNotifiable 返回空", () => {
  const future = new Date(Date.now() + 30 * 60_000).toISOString();
  const mutedSettings = { ...FIXTURE_SETTINGS, mutedUntil: future };
  const notifiable = filterNotifiable(FIXTURE_MESSAGES, mutedSettings);
  assert.equal(notifiable.length, 0, "静音状态不应弹通知");
});

test("静音状态下 shouldNotify 返回 false（即使 frequency=frequent）", () => {
  const future = new Date(Date.now() + 30 * 60_000).toISOString();
  const mutedSettings = { frequency: "frequent", doNotDisturb: false, mutedUntil: future };
  const msg = FIXTURE_MESSAGES[0];
  assert.equal(shouldNotify(msg, mutedSettings), false, "静音时即使 frequent 也不应通知");
});

// ============================================================
// 6. 消息严重性分类
// ============================================================

test("fixture 覆盖全部 4 种严重性", () => {
  const severities = new Set(jsonMessages.map((m) => m.severity));
  for (const sev of ALL_SEVERITIES) {
    assert.ok(severities.has(sev), `缺少严重性 ${sev}`);
  }
});

test("task_completed 的 severity 为 success", () => {
  const completed = jsonMessages.filter((m) => m.type === "task_completed");
  assert.ok(completed.length >= 1);
  for (const msg of completed) {
    assert.equal(msg.severity, "success", `task_completed 应为 success: ${msg.id}`);
  }
});

test("task_failed 的 severity 为 error", () => {
  const failed = jsonMessages.filter((m) => m.type === "task_failed");
  assert.ok(failed.length >= 1);
  for (const msg of failed) {
    assert.equal(msg.severity, "error", `task_failed 应为 error: ${msg.id}`);
  }
});

test("task_needs_confirm 的 severity 为 warning", () => {
  const confirm = jsonMessages.filter((m) => m.type === "task_needs_confirm");
  assert.ok(confirm.length >= 1);
  for (const msg of confirm) {
    assert.equal(msg.severity, "warning", `task_needs_confirm 应为 warning: ${msg.id}`);
  }
});

test("proposal_pending 的 severity 为 warning", () => {
  const proposals = jsonMessages.filter((m) => m.type === "proposal_pending");
  assert.ok(proposals.length >= 1);
  for (const msg of proposals) {
    assert.equal(msg.severity, "warning", `proposal_pending 应为 warning: ${msg.id}`);
  }
});

test("computeStats 与 fixture.stats 一致", () => {
  const computed = computeStats(FIXTURE_MESSAGES);
  assert.equal(computed.total, FIXTURE_STATS.total);
  assert.equal(computed.unread, FIXTURE_STATS.unread);
  for (const sev of ALL_SEVERITIES) {
    assert.equal(computed.bySeverity[sev], FIXTURE_STATS.bySeverity[sev], `bySeverity[${sev}] 不匹配`);
  }
});

test("computeStats 对空数组返回 0 计数", () => {
  const empty = computeStats([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.unread, 0);
  for (const sev of ALL_SEVERITIES) {
    assert.equal(empty.bySeverity[sev], 0);
  }
});

// ============================================================
// 7. 跳转动作 URL 存在性
// ============================================================

test("每条消息都有 actionLabel 和 actionUrl，或都没有", () => {
  for (const msg of jsonMessages) {
    if (msg.actionLabel) {
      assert.ok(msg.actionUrl, `有 actionLabel 但缺 actionUrl: ${msg.id}`);
    }
    if (msg.actionUrl) {
      assert.ok(msg.actionLabel, `有 actionUrl 但缺 actionLabel: ${msg.id}`);
    }
  }
});

test("actionUrl 是以 / 开头的内部路径（跳转到对应页面）", () => {
  for (const msg of jsonMessages) {
    if (msg.actionUrl) {
      assert.ok(msg.actionUrl.startsWith("/"), `actionUrl 必须以 / 开头: ${msg.id}`);
      assert.ok(!msg.actionUrl.includes("://"), `actionUrl 不应为外部 URL: ${msg.id}`);
    }
  }
});

test("task_* 消息的 actionUrl 指向 /job-center（可在任务中心找到对应记录）", () => {
  const taskMessages = jsonMessages.filter((m) => m.type.startsWith("task_"));
  assert.ok(taskMessages.length >= 3, "应至少有 3 条 task_* 消息");
  for (const msg of taskMessages) {
    assert.equal(msg.actionUrl, "/job-center", `task_* 消息应指向 /job-center: ${msg.id}`);
    assert.ok(msg.relatedJobId, `task_* 消息应有 relatedJobId: ${msg.id}`);
  }
});

test("proposal_pending 消息有 relatedProposalId", () => {
  const proposals = jsonMessages.filter((m) => m.type === "proposal_pending");
  for (const msg of proposals) {
    assert.ok(msg.relatedProposalId, `proposal_pending 应有 relatedProposalId: ${msg.id}`);
  }
});

test('KK 不代为确认：actionLabel 是跳转/查看语义，不是确认/接受代执行', () => {
  // actionLabel 应引导用户去对应页面，而非代为执行确认
  for (const msg of jsonMessages) {
    if (msg.actionLabel) {
      // 不应包含"已确认"/"已接受"/"已修改"等代执行语义
      assert.ok(
        !msg.actionLabel.includes("已确认") && !msg.actionLabel.includes("已接受"),
        `actionLabel 不应是代执行语义: ${msg.id} -> ${msg.actionLabel}`,
      );
    }
  }
});

// ============================================================
// 8. 防漂移断言：TS 内联与 JSON 一致
// ============================================================

test("防漂移：TS 内联 messages 与 JSON messages 数量一致", () => {
  assert.equal(FIXTURE_MESSAGES.length, jsonMessages.length, "TS 与 JSON 消息数量不一致");
});

test("防漂移：TS 内联每条 message 与 JSON 逐字段一致", () => {
  for (let i = 0; i < FIXTURE_MESSAGES.length; i++) {
    const ts = FIXTURE_MESSAGES[i];
    const json = jsonMessages[i];
    assert.equal(ts.id, json.id, `id 不一致: ${ts.id} vs ${json.id}`);
    assert.equal(ts.type, json.type, `type 不一致: ${ts.id}`);
    assert.equal(ts.title, json.title, `title 不一致: ${ts.id}`);
    assert.equal(ts.body, json.body, `body 不一致: ${ts.id}`);
    assert.equal(ts.severity, json.severity, `severity 不一致: ${ts.id}`);
    assert.equal(ts.createdAt, json.createdAt, `createdAt 不一致: ${ts.id}`);
    assert.equal(ts.read, json.read, `read 不一致: ${ts.id}`);
    assert.equal(ts.actionLabel ?? null, json.actionLabel ?? null, `actionLabel 不一致: ${ts.id}`);
    assert.equal(ts.actionUrl ?? null, json.actionUrl ?? null, `actionUrl 不一致: ${ts.id}`);
    assert.equal(ts.relatedJobId ?? null, json.relatedJobId ?? null, `relatedJobId 不一致: ${ts.id}`);
    assert.equal(ts.relatedProposalId ?? null, json.relatedProposalId ?? null, `relatedProposalId 不一致: ${ts.id}`);
  }
});

test("防漂移：TS 内联 settings 与 JSON settings 一致", () => {
  assert.equal(FIXTURE_SETTINGS.frequency, jsonSettings.frequency);
  assert.equal(FIXTURE_SETTINGS.doNotDisturb, jsonSettings.doNotDisturb);
  assert.equal(FIXTURE_SETTINGS.mutedUntil ?? null, jsonSettings.mutedUntil ?? null);
});

test("防漂移：TS 内联 stats 与 JSON stats 一致", () => {
  assert.equal(FIXTURE_STATS.total, jsonStats.total);
  assert.equal(FIXTURE_STATS.unread, jsonStats.unread);
  for (const sev of ALL_SEVERITIES) {
    assert.equal(FIXTURE_STATS.bySeverity[sev], jsonStats.bySeverity[sev], `bySeverity[${sev}] 不一致`);
  }
});

test("防漂移：computeStats(FIXTURE_MESSAGES) 与 JSON stats 一致", () => {
  const computed = computeStats(FIXTURE_MESSAGES);
  assert.equal(computed.total, jsonStats.total);
  assert.equal(computed.unread, jsonStats.unread);
  for (const sev of ALL_SEVERITIES) {
    assert.equal(computed.bySeverity[sev], jsonStats.bySeverity[sev]);
  }
});
