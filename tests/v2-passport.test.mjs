/**
 * TRAE-V2-02 Character Passport
 * 三层 Prompt 合成契约 + scope 校验 + 锁定规则测试
 *
 * PRD §10.1 单元/契约测试要求：Passport 三层降级、锁定字段保护
 *
 * 验证目标：
 *   1. 三层 Prompt 来源契约（scene_override > project_override > actor_default > empty）
 *   2. PassportPromptInput scope 校验逻辑
 *   3. 锁定规则（coreIdentityLocked / appearanceLockedByDefault）
 *   4. PassportIdentity 字段映射契约
 *   5. fetchPassportPrompt 降级链路（静态契约）
 *
 * 运行：node --test tests/v2-passport.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// ============================================================
// 类型契约（静态检查源码）
// ============================================================

const queriesSource = readFileSync("lib/character-passport/queries.ts", "utf8");
const typesSource = readFileSync("lib/character-passport/types.ts", "utf8");

// ============================================================
// 1. 三层 Prompt 来源契约
// ============================================================

test("PassportPromptSource 类型定义 4 种来源", () => {
  assert.ok(typesSource.includes('"scene_override"'));
  assert.ok(typesSource.includes('"project_override"'));
  assert.ok(typesSource.includes('"actor_default"'));
  assert.ok(typesSource.includes('"empty"'));
});

test("fetchPassportPrompt 实现降级链路：scene > project > actor_default > empty", () => {
  // 静态契约：源码中必须按此顺序尝试
  // 注意：empty 是变量定义在函数开头，return empty 在最后
  const sceneIdx = queriesSource.indexOf('source: "scene_override"');
  const projectIdx = queriesSource.indexOf('source: "project_override"');
  const actorIdx = queriesSource.indexOf('source: "actor_default"');
  const emptyIdx = queriesSource.lastIndexOf('return empty;')

  assert.ok(sceneIdx > 0, "必须有 scene_override 分支");
  assert.ok(projectIdx > 0, "必须有 project_override 分支");
  assert.ok(actorIdx > 0, "必须有 actor_default 分支");
  assert.ok(emptyIdx > 0, "必须有 empty 兜底");

  // 顺序检查：scene < project < actor < empty
  assert.ok(sceneIdx < projectIdx, "scene_override 应在 project_override 之前");
  assert.ok(projectIdx < actorIdx, "project_override 应在 actor_default 之前");
  assert.ok(actorIdx < emptyIdx, "actor_default 应在 empty 之前");
});

test("fetchPassportPrompt 空 actors 返回 empty source", () => {
  // 静态契约：actors.length === 0 时直接返回 empty
  assert.ok(
    queriesSource.includes("if (actors.length === 0) return empty;"),
    "无演员时应直接返回 empty source",
  );
});

// ============================================================
// 2. scope 校验逻辑
// ============================================================

test("updatePassportPrompt scope=actor_default 不需要 projectId", () => {
  // 静态契约：actor_default 分支不强制 projectId
  assert.ok(
    queriesSource.includes('const scope = input.scope ?? "actor_default"'),
    "默认 scope 应为 actor_default",
  );
});

test("updatePassportPrompt scope=project_override 必须有 projectId", () => {
  assert.ok(
    queriesSource.includes('scope === "project_override" && !input.projectId'),
    "project_override 必须校验 projectId",
  );
  assert.ok(
    queriesSource.includes('"PROJECT_ID_REQUIRED"'),
    "缺少 projectId 应抛 PROJECT_ID_REQUIRED",
  );
});

test("updatePassportPrompt scope=scene_override 必须有 projectId 和 sceneId", () => {
  assert.ok(
    queriesSource.includes('scope === "scene_override" && (!input.projectId || !input.sceneId)'),
    "scene_override 必须校验 projectId 和 sceneId",
  );
  assert.ok(
    queriesSource.includes('"PROJECT_AND_SCENE_REQUIRED"'),
    "缺少 projectId/sceneId 应抛 PROJECT_AND_SCENE_REQUIRED",
  );
});

test("updatePassportPrompt 非 actor_default scope 必须传 actorProfileId", () => {
  assert.ok(
    queriesSource.includes('scope !== "actor_default" && !actorProfileId'),
    "非 actor_default 必须传 actorProfileId",
  );
  assert.ok(
    queriesSource.includes('"ACTOR_PROFILE_REQUIRED_FOR_OVERRIDE"'),
    "缺少 actorProfileId 应抛 ACTOR_PROFILE_REQUIRED_FOR_OVERRIDE",
  );
});

// ============================================================
// 3. 锁定规则
// ============================================================

test("identity_core_prompt 锁定时不可改（除非显式解锁）", () => {
  // 静态契约：coreIdentityLocked=true 时，identity_core_prompt 不可改
  assert.ok(
    queriesSource.includes("core_identity_locked"),
    "必须读取 core_identity_locked 字段",
  );
  assert.ok(
    queriesSource.includes("input.coreIdentityLocked === false"),
    "必须支持显式解锁（coreIdentityLocked=false）",
  );
});

test("current_appearance_prompt 锁定时不可改（除非显式解锁）", () => {
  assert.ok(
    queriesSource.includes("appearance_locked_by_default"),
    "必须读取 appearance_locked_by_default 字段",
  );
  assert.ok(
    queriesSource.includes("input.appearanceLockedByDefault === false"),
    "必须支持显式解锁（appearanceLockedByDefault=false）",
  );
});

test("scene_override_prompt 始终可改", () => {
  // 静态契约：scene_override_prompt 不受锁定约束
  const sceneOverrideLine = queriesSource.split("\n").find((l) =>
    l.includes("scene_override_prompt") && l.includes("input.sceneOverridePrompt")
  );
  assert.ok(sceneOverrideLine, "必须有 scene_override_prompt 写入逻辑");
  // 该行附近不应有 locked 校验
  assert.ok(
    queriesSource.includes("// scene_override_prompt：始终可改"),
    "scene_override_prompt 应标注为始终可改",
  );
});

test("默认值：coreIdentityLocked=true, appearanceLockedByDefault=true", () => {
  // 新建行时默认锁定
  assert.ok(
    queriesSource.includes("core_identity_locked: input.coreIdentityLocked ?? true"),
    "新建时 core_identity_locked 默认 true",
  );
  assert.ok(
    queriesSource.includes("appearance_locked_by_default: input.appearanceLockedByDefault ?? true"),
    "新建时 appearance_locked_by_default 默认 true",
  );
});

// ============================================================
// 4. PassportIdentity 字段契约
// ============================================================

test("PassportIdentity 包含必需字段", () => {
  const requiredFields = [
    "entityId",
    "universeId",
    "name",
    "summary",
    "details",
    "canonStatus",
    "tags",
    "updatedAt",
  ];
  for (const field of requiredFields) {
    assert.ok(
      typesSource.includes(`${field}:`),
      `PassportIdentity 必须包含字段 ${field}`,
    );
  }
});

test("fetchIdentity 查询 universe_entities 表 type=character", () => {
  assert.ok(
    queriesSource.includes('from("storyflow_universe_entities")'),
    "必须查询 storyflow_universe_entities 表",
  );
  assert.ok(
    queriesSource.includes('.eq("type", "character")'),
    "必须过滤 type=character",
  );
  assert.ok(
    queriesSource.includes(".eq(\"id\", entityId)"),
    "必须按 id 过滤",
  );
  assert.ok(
    queriesSource.includes(".eq(\"universe_id\", universeId)"),
    "必须按 universe_id 过滤",
  );
});

test("updateIdentity 校验所有者 + entity 属于该 universe", () => {
  assert.ok(
    queriesSource.includes("if (row.user_id && row.user_id !== ownerId)"),
    "updateIdentity 必须校验 user_id === ownerId",
  );
  assert.ok(
    queriesSource.includes('"FORBIDDEN"'),
    "非所有者应抛 FORBIDDEN",
  );
  assert.ok(
    queriesSource.includes('"CHARACTER_NOT_FOUND"'),
    "找不到角色应抛 CHARACTER_NOT_FOUND",
  );
});

// ============================================================
// 5. CharacterPassportDTO 聚合根契约
// ============================================================

test("CharacterPassportDTO 聚合 5 张表 + voiceProfile", () => {
  const requiredFields = [
    "identity",
    "actors",
    "portrayals",
    "appearanceVariants",
    "prompt",
    "voiceProfile",
  ];
  for (const field of requiredFields) {
    assert.ok(
      typesSource.includes(`${field}:`),
      `CharacterPassportDTO 必须包含字段 ${field}`,
    );
  }
});

test("fetchCharacterPassport 返回 6 个聚合字段", () => {
  // 返回对象必须包含全部字段
  const returnBlock = queriesSource.match(/return\s*\{[^}]*identity[^}]*actors[^}]*}/s);
  assert.ok(returnBlock, "fetchCharacterPassport 必须返回聚合对象");
  assert.ok(returnBlock[0].includes("identity"), "返回值包含 identity");
  assert.ok(returnBlock[0].includes("actors"), "返回值包含 actors");
  assert.ok(returnBlock[0].includes("portrayals"), "返回值包含 portrayals");
  assert.ok(returnBlock[0].includes("appearanceVariants"), "返回值包含 appearanceVariants");
  assert.ok(returnBlock[0].includes("prompt"), "返回值包含 prompt");
  assert.ok(returnBlock[0].includes("voiceProfile"), "返回值包含 voiceProfile");
});

// ============================================================
// 6. V2-03 集成：voiceProfile 容错
// ============================================================

test("fetchCharacterPassport voiceProfile 查询失败不阻塞整包", () => {
  // 静态契约：voiceProfile 查询用 .catch(() => null) 容错
  assert.ok(
    queriesSource.includes(".catch(() => null)"),
    "voiceProfile 查询必须容错（.catch(() => null)）",
  );
});

// ============================================================
// 7. 三层 Prompt 写入路径
// ============================================================

test("scope=actor_default 写入 actor_profiles.metadata.identity_passport", () => {
  assert.ok(
    queriesSource.includes("upsertActorDefaultPassport"),
    "必须有 upsertActorDefaultPassport 函数",
  );
  assert.ok(
    queriesSource.includes("identity_passport"),
    "必须写入 metadata.identity_passport 字段",
  );
  // 二级合并：保留未传入的字段
  assert.ok(
    queriesSource.includes("...existingPassport"),
    "必须做二级合并（保留未传入字段）",
  );
});

test("scope=project_override/scene_override 写入 storyflow_identity_passports 表", () => {
  assert.ok(
    queriesSource.includes("upsertIdentityPassportRow"),
    "必须有 upsertIdentityPassportRow 函数",
  );
  assert.ok(
    queriesSource.includes('from("storyflow_identity_passports")'),
    "必须写入 storyflow_identity_passports 表",
  );
  // scene_override 写入 scene_id，project_override 写入 scene_id=null
  assert.ok(
    queriesSource.includes('scope === "scene_override" ? input.sceneId : null'),
    "scene_override 写入 sceneId，project_override 写入 null",
  );
});

test("findFirstActorForEntity 通过 appearance_variants 反查 actor", () => {
  assert.ok(
    queriesSource.includes("findFirstActorForEntity"),
    "必须有 findFirstActorForEntity 函数",
  );
  assert.ok(
    queriesSource.includes('from("storyflow_character_appearance_variants")'),
    "必须通过 appearance_variants 反查 actor",
  );
  assert.ok(
    queriesSource.includes('"NO_ACTOR_BOUND_TO_CHARACTER"'),
    "无关联 actor 应抛 NO_ACTOR_BOUND_TO_CHARACTER",
  );
});
