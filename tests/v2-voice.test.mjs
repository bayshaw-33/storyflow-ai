/**
 * TRAE-V2-03 Voice Profile + Voice Line
 * 状态机契约 + 校验逻辑 + 幂等性测试
 *
 * PRD §10.1 单元/契约测试要求：Voice Profile 唯一性、Voice Line 状态机
 *
 * 验证目标：
 *   1. VoiceProfileStatus 状态机（draft/ready/archived，archived 不可再修改）
 *   2. VoiceLineStatus 状态机（draft→ready→queued→generating→generated→approved）
 *   3. createVoiceProfile 校验（actor_profile_id 或 universe_entity_id 至少一个）
 *   4. createVoiceProfile 幂等性（同 entity/actor 已存在则返回现有）
 *   5. approveVoiceLine 前置条件（assetId 非 null）
 *   6. 已 approved 的 Voice Line 不可直接修改
 *   7. 失败状态写入 error + last_failed_at
 *   8. attachAssetToVoiceLine 推进到 generated + revision 递增
 *   9. 临时 Provider URL 永不入库
 *
 * 运行：node --test tests/v2-voice.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const queriesSource = readFileSync("lib/voice/queries.ts", "utf8");
const typesSource = readFileSync("lib/voice/types.ts", "utf8");

// ============================================================
// 1. VoiceProfileStatus 状态机契约
// ============================================================

test("VoiceProfileStatus 包含 3 种状态", () => {
  assert.ok(typesSource.includes('"draft"'));
  assert.ok(typesSource.includes('"ready"'));
  assert.ok(typesSource.includes('"archived"'));
});

test("archived 的 Voice Profile 不可再修改", () => {
  assert.ok(
    queriesSource.includes('if (current.status === "archived") throw new Error("VOICE_PROFILE_ARCHIVED")'),
    "updateVoiceProfile 必须拒绝 archived 状态",
  );
});

test("fetchVoiceProfileByEntity 自动跳过 archived", () => {
  assert.ok(
    queriesSource.includes('.neq("status", "archived")'),
    "查询必须排除 archived 状态",
  );
});

test("archiveVoiceProfile 软删除（只改 status，不删行）", () => {
  assert.ok(
    queriesSource.includes("archiveVoiceProfile"),
    "必须有 archiveVoiceProfile 函数",
  );
  assert.ok(
    queriesSource.includes('update({ status: "archived" })'),
    "archive 必须用 update 而非 delete",
  );
});

// ============================================================
// 2. VoiceLineStatus 状态机契约
// ============================================================

test("VoiceLineStatus 包含完整状态机", () => {
  const requiredStatuses = [
    "draft",
    "ready",
    "queued",
    "generating",
    "result_ingesting",
    "generated",
    "approved",
    "failed",
    "provider_timeout",
    "moderation_blocked",
  ];
  for (const s of requiredStatuses) {
    assert.ok(typesSource.includes(`"${s}"`), `VoiceLineStatus 必须包含 ${s}`);
  }
});

test("approved 是终态，需通过 approveVoiceLine 进入", () => {
  assert.ok(
    queriesSource.includes("approveVoiceLine"),
    "必须有 approveVoiceLine 函数",
  );
  assert.ok(
    queriesSource.includes("is_approved: true"),
    "approveVoiceLine 必须设置 is_approved=true",
  );
  assert.ok(
    queriesSource.includes('status: "approved"'),
    "approveVoiceLine 必须设置 status=approved",
  );
});

test("approveVoiceLine 前置条件：assetId 非 null", () => {
  assert.ok(
    queriesSource.includes("if (!current.assetId)"),
    "必须校验 assetId 非 null",
  );
  assert.ok(
    queriesSource.includes('"VOICE_LINE_ASSET_REQUIRED_FOR_APPROVAL"'),
    "缺少 assetId 应抛 VOICE_LINE_ASSET_REQUIRED_FOR_APPROVAL",
  );
});

test("unapproveVoiceLine 从 approved 回到 generated", () => {
  assert.ok(
    queriesSource.includes("unapproveVoiceLine"),
    "必须有 unapproveVoiceLine 函数",
  );
  assert.ok(
    queriesSource.includes('status: "generated"'),
    "unapprove 必须回到 generated 状态",
  );
  assert.ok(
    queriesSource.includes("is_approved: false"),
    "unapprove 必须设置 is_approved=false",
  );
});

test("已 approved 的 Voice Line 不可直接修改（需先回到 draft）", () => {
  assert.ok(
    queriesSource.includes("if (current.isApproved)"),
    "updateVoiceLine 必须检查 isApproved",
  );
  assert.ok(
    queriesSource.includes('"VOICE_LINE_APPROVED_LOCKED"'),
    "approved 状态应抛 VOICE_LINE_APPROVED_LOCKED",
  );
});

// ============================================================
// 3. 失败状态写入 error + last_failed_at
// ============================================================

test("failed/provider_timeout/moderation_blocked 写入 error + last_failed_at", () => {
  assert.ok(
    queriesSource.includes('["failed", "provider_timeout", "moderation_blocked"]'),
    "必须定义失败状态列表",
  );
  assert.ok(
    queriesSource.includes("patch.error = extra?.error ?? null"),
    "失败状态必须写入 error 字段",
  );
  assert.ok(
    queriesSource.includes("patch.last_failed_at = new Date().toISOString()"),
    "失败状态必须写入 last_failed_at",
  );
});

test("非失败状态清空 error + last_failed_at", () => {
  assert.ok(
    queriesSource.includes("patch.error = null"),
    "非失败状态必须清空 error",
  );
  // 注意：last_failed_at 在非失败状态下也应清空
  assert.ok(
    queriesSource.includes("patch.last_failed_at = null"),
    "非失败状态必须清空 last_failed_at",
  );
});

test("generated/approved 写入 completed_at", () => {
  assert.ok(
    queriesSource.includes('status === "generated" || status === "approved"'),
    "必须对 generated/approved 写入 completed_at",
  );
  assert.ok(
    queriesSource.includes("patch.completed_at = new Date().toISOString()"),
    "必须写入 completed_at",
  );
});

// ============================================================
// 4. createVoiceProfile 校验
// ============================================================

test("createVoiceProfile 至少需要 actor_profile_id 或 universe_entity_id", () => {
  assert.ok(
    queriesSource.includes("if (!actorProfileId && !universeEntityId)"),
    "必须校验至少一个 target",
  );
  assert.ok(
    queriesSource.includes('"VOICE_PROFILE_TARGET_REQUIRED"'),
    "缺少 target 应抛 VOICE_PROFILE_TARGET_REQUIRED",
  );
});

test("createVoiceProfile 默认值：provider=placeholder, language=zh, status=draft", () => {
  assert.ok(
    queriesSource.includes('voice_provider: input.voiceProvider ?? "placeholder"'),
    "默认 provider 应为 placeholder",
  );
  assert.ok(
    queriesSource.includes('language: input.language ?? "zh"'),
    "默认 language 应为 zh",
  );
  assert.ok(
    queriesSource.includes('status: "draft"'),
    "默认 status 应为 draft",
  );
});

// ============================================================
// 5. createVoiceProfile 幂等性
// ============================================================

test("createVoiceProfile 幂等：同 entity 已存在则返回现有", () => {
  assert.ok(
    queriesSource.includes("if (universeEntityId)"),
    "必须先按 universeEntityId 查询",
  );
  assert.ok(
    queriesSource.includes("if (!existing && actorProfileId)"),
    "再按 actorProfileId 查询",
  );
  assert.ok(
    queriesSource.includes("if (existing) return existing"),
    "已存在则返回现有，不重复创建",
  );
});

test("createVoiceLine 幂等：同 profile+shot+text 不重复创建", () => {
  assert.ok(
    queriesSource.includes("if (shotId && projectId)"),
    "幂等校验需 shotId + projectId",
  );
  assert.ok(
    queriesSource.includes(".eq(\"text\", input.text)"),
    "幂等校验需 text 一致",
  );
  assert.ok(
    queriesSource.includes("if (existing) return mapLineRow"),
    "已存在则返回现有",
  );
});

test("createVoiceLine 校验 profile 归属 + 非 archived", () => {
  assert.ok(
    queriesSource.includes("if (!profile) throw new Error(\"VOICE_PROFILE_NOT_FOUND\")"),
    "必须校验 profile 存在",
  );
  assert.ok(
    queriesSource.includes("if (profile.status === \"archived\")"),
    "必须拒绝 archived profile",
  );
});

// ============================================================
// 6. attachAssetToVoiceLine 推进状态机
// ============================================================

test("attachAssetToVoiceLine 推进到 generated + revision 递增", () => {
  assert.ok(
    queriesSource.includes('status: "generated"'),
    "attachAsset 必须推进到 generated",
  );
  assert.ok(
    queriesSource.includes("revision: current.revision + 1"),
    "attachAsset 必须 revision + 1",
  );
  assert.ok(
    queriesSource.includes("completed_at: new Date().toISOString()"),
    "attachAsset 必须写入 completed_at",
  );
});

test("attachAssetToVoiceLine 清空 error + last_failed_at", () => {
  assert.ok(
    queriesSource.includes("error: null"),
    "attachAsset 必须清空 error",
  );
  assert.ok(
    queriesSource.includes("last_failed_at: null"),
    "attachAsset 必须清空 last_failed_at",
  );
});

test("attachJobToVoiceLine 关联 jobId + 推进状态", () => {
  assert.ok(
    queriesSource.includes("attachJobToVoiceLine"),
    "必须有 attachJobToVoiceLine 函数",
  );
  assert.ok(
    queriesSource.includes("latest_job_id: jobId"),
    "必须写入 latest_job_id",
  );
  assert.ok(
    queriesSource.includes('status,') && queriesSource.includes("status: VoiceLineStatus ="),
    "必须支持传入 status（默认 queued）",
  );
});

// ============================================================
// 7. 安全约束：临时 Provider URL 永不入库
// ============================================================

test("attachAssetToVoiceLine 只接收 storage_path，不接收 Provider URL", () => {
  // 静态契约：参数必须是 storagePath，不能是 providerUrl
  assert.ok(
    queriesSource.includes("storagePath: string"),
    "参数必须包含 storagePath",
  );
  assert.ok(
    queriesSource.includes("signedUrl: string"),
    "参数必须包含 signedUrl（由 storage.ts 生成）",
  );
  assert.ok(
    queriesSource.includes("signedUrlExpiresAt: string"),
    "参数必须包含 signedUrlExpiresAt",
  );
  // 不应有 providerUrl 参数
  assert.ok(
    !queriesSource.includes("providerUrl"),
    "不应有 providerUrl 参数",
  );
});

test("Voice Line 字段契约：signed_url + signed_url_expires_at + storage_path", () => {
  // VoiceLineRow 必须包含这些字段
  assert.ok(
    queriesSource.includes("signed_url: string | null"),
    "VoiceLineRow 必须有 signed_url 字段",
  );
  assert.ok(
    queriesSource.includes("signed_url_expires_at: string | null"),
    "VoiceLineRow 必须有 signed_url_expires_at 字段",
  );
  assert.ok(
    queriesSource.includes("storage_path: string | null"),
    "VoiceLineRow 必须有 storage_path 字段",
  );
});

// ============================================================
// 8. DTO 映射契约
// ============================================================

test("mapProfileRow 字段映射正确", () => {
  assert.ok(
    queriesSource.includes("ownerId: row.owner_id"),
    "mapProfileRow 必须映射 owner_id → ownerId",
  );
  assert.ok(
    queriesSource.includes("universeEntityId: row.universe_entity_id"),
    "mapProfileRow 必须映射 universe_entity_id → universeEntityId",
  );
  assert.ok(
    queriesSource.includes("voiceLabel: row.voice_label"),
    "mapProfileRow 必须映射 voice_label → voiceLabel",
  );
  assert.ok(
    queriesSource.includes("voiceProvider: row.voice_provider"),
    "mapProfileRow 必须映射 voice_provider → voiceProvider",
  );
});

test("mapLineRow 字段映射正确", () => {
  assert.ok(
    queriesSource.includes("voiceProfileId: row.voice_profile_id"),
    "mapLineRow 必须映射 voice_profile_id → voiceProfileId",
  );
  assert.ok(
    queriesSource.includes("isApproved: row.is_approved"),
    "mapLineRow 必须映射 is_approved → isApproved",
  );
  assert.ok(
    queriesSource.includes("revision: row.revision"),
    "mapLineRow 必须映射 revision",
  );
  assert.ok(
    queriesSource.includes("audioUrl: row.signed_url"),
    "mapLineRow 必须映射 signed_url → audioUrl",
  );
});

test("VoiceProfileDTO 包含必需字段", () => {
  const requiredFields = [
    "id",
    "ownerId",
    "actorProfileId",
    "universeEntityId",
    "voiceLabel",
    "voiceProvider",
    "voiceProviderVoiceId",
    "language",
    "speed",
    "pitch",
    "stability",
    "stylePrompt",
    "status",
    "updatedAt",
  ];
  for (const field of requiredFields) {
    assert.ok(
      typesSource.includes(`${field}:`),
      `VoiceProfileDTO 必须包含字段 ${field}`,
    );
  }
});

test("VoiceLineDTO 包含必需字段", () => {
  const requiredFields = [
    "id",
    "ownerId",
    "voiceProfileId",
    "text",
    "language",
    "ssml",
    "projectId",
    "sceneId",
    "shotId",
    "latestJobId",
    "assetId",
    "audioUrl",
    "signedUrlExpiresAt",
    "status",
    "error",
    "durationSeconds",
    "revision",
    "isApproved",
    "updatedAt",
    "completedAt",
  ];
  for (const field of requiredFields) {
    assert.ok(
      typesSource.includes(`${field}:`),
      `VoiceLineDTO 必须包含字段 ${field}`,
    );
  }
});

// ============================================================
// 9. 表名契约
// ============================================================

test("Voice Profile 表名: storyflow_character_voice_profiles", () => {
  assert.ok(
    queriesSource.includes('from("storyflow_character_voice_profiles")'),
    "必须使用 storyflow_character_voice_profiles 表",
  );
});

test("Voice Line 表名: storyflow_voice_lines", () => {
  assert.ok(
    queriesSource.includes('from("storyflow_voice_lines")'),
    "必须使用 storyflow_voice_lines 表",
  );
});

// ============================================================
// 10. 所有者隔离契约
// ============================================================

test("所有 Voice Profile 查询都按 owner_id 过滤", () => {
  // 统计 owner_id 过滤的次数
  const ownerIdFilters = (queriesSource.match(/\.eq\("owner_id", ownerId\)/g) || []).length;
  assert.ok(ownerIdFilters >= 6, `应有至少 6 处 owner_id 过滤，实际 ${ownerIdFilters}`);
});

test("所有 Voice Profile 写入都设置 owner_id", () => {
  assert.ok(
    queriesSource.includes("owner_id: ownerId"),
    "insert 时必须设置 owner_id",
  );
  assert.ok(
    queriesSource.includes('.eq("owner_id", ownerId)'),
    "update 时必须按 owner_id 过滤",
  );
});
