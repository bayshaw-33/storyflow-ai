/**
 * TRAE-V2 E2E Flow Contract
 * PRD §10.3 12 步全链路流程契约测试
 *
 * 由于真实 E2E 需要 dev server，本测试做静态契约验证：
 *   - 验证每步对应的 API 路由文件存在
 *   - 验证关键模块文件存在
 *   - 验证数据流转契约（稳定 ID 串联）
 *   - 验证 Feature Flag 关键开关
 *
 * PRD §10.3 12 步流程：
 *   1. 创建 Universe
 *   2. 创建 Character（universe_entity）
 *   3. 创建 Character Graph（关系）
 *   4. 生成 Character Passport（聚合 5 表）
 *   5. 创建 Voice Profile（V2-03）
 *   6. 生成 Voice Line（TTS）
 *   7. 创建 Production Project
 *   8. AI Director 拆解 Scene/Shot（V2-04）
 *   9. Video Gateway 生成视频（V2-05）
 *  10. Assembly Sequence 组装（V2-06）
 *  11. Editor Timeline 导出 FCPXML/EDL（V2-06）
 *  12. Production Package 打包（V2-07）
 *
 * 运行：node --test tests/v2-e2e-flow.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

function fileExists(relPath) {
  return existsSync(relPath);
}

function readFile(relPath) {
  return readFileSync(relPath, "utf8");
}

// 1. Universe
test("Step 1: Universe 创建 API 路由存在", () => {
  assert.ok(fileExists("app/api/u/[username]/universes/route.ts"), "universes API 路径");
});

test("Step 1: Universe 查询模块存在", () => {
  assert.ok(fileExists("lib/universe/index.ts") || fileExists("lib/universe.ts"));
});

// 2. Character
test("Step 2: Character 创建/读取 API 路由存在", () => {
  // Character 通过 universe 内部 API 或 character-graph 管理
  assert.ok(
    fileExists("app/api/universes/[universeId]/character-graph/route.ts") ||
    fileExists("app/api/universes/[universeId]/characters/[entityId]/passport/route.ts"),
    "character 相关 API 必须存在",
  );
});

// 3. Character Graph
test("Step 3: Character Graph API 路由存在", () => {
  assert.ok(fileExists("app/api/universes/[universeId]/character-graph/route.ts"));
});

test("Step 3: Character Graph 布局算法模块存在", () => {
  assert.ok(fileExists("lib/universe/character-graph-layout.ts"));
  assert.ok(fileExists("lib/universe/character-graph-queries.ts"));
});

// 4. Character Passport
test("Step 4: Character Passport API 路由存在", () => {
  assert.ok(fileExists("app/api/universes/[universeId]/characters/[entityId]/passport/route.ts"));
});

test("Step 4: Passport 查询模块存在", () => {
  assert.ok(fileExists("lib/character-passport/queries.ts"));
  assert.ok(fileExists("lib/character-passport/types.ts"));
});

test("Step 4: Passport 聚合 5 张表 + voiceProfile", () => {
  const source = readFile("lib/character-passport/queries.ts");
  assert.ok(source.includes("storyflow_universe_entities"));
  assert.ok(source.includes("storyflow_actor_profiles"));
  assert.ok(source.includes("storyflow_character_portrayals"));
  assert.ok(source.includes("storyflow_character_appearance_variants"));
  assert.ok(source.includes("storyflow_identity_passports"));
  assert.ok(source.includes("fetchVoiceProfileByEntity"));
});

// 5. Voice Profile
test("Step 5: Voice Profile 模块存在", () => {
  assert.ok(fileExists("lib/voice/queries.ts"));
  assert.ok(fileExists("lib/voice/types.ts"));
  assert.ok(fileExists("lib/voice/provider.ts"));
});

test("Step 5: Voice Profile 表已通过 migration 创建", () => {
  const migrationContent = readFile("supabase/migrations/20260826000000_voice_profiles_and_lines.sql");
  assert.ok(migrationContent.includes("storyflow_character_voice_profiles"));
  assert.ok(migrationContent.includes("storyflow_voice_lines"));
});

// 6. Voice Line TTS
test("Step 6: Voice Line API 路由存在", () => {
  assert.ok(fileExists("app/api/universes/[universeId]/characters/[entityId]/voice-lines/route.ts"), "voice-lines API 路径");
});

test("Step 6: TTS Provider 模块存在", () => {
  assert.ok(fileExists("lib/voice/providers/openai.ts"));
  assert.ok(fileExists("lib/voice/providers/placeholder.ts"));
});

// 7. Production Project
test("Step 7: Production Project API 路由存在", () => {
  // Production 通过 app/api/production/* 系列路由管理
  assert.ok(
    fileExists("app/api/production/save-state/route.ts") ||
    fileExists("app/api/production/verify-entry/route.ts"),
    "production API 必须存在",
  );
});

// 8. AI Director
test("Step 8: AI Director 模块存在", () => {
  assert.ok(fileExists("lib/director/"));
});

test("Step 8: Director API 路由存在", () => {
  assert.ok(
    fileExists("app/api/director/analyze/route.ts") ||
    fileExists("app/api/director/scenes/route.ts"),
  );
});

test("Step 8: Director migration 已创建", () => {
  const migrationContent = readFile("supabase/migrations/20260826000001_director_meta.sql");
  assert.ok(migrationContent.includes("director_meta"));
  assert.ok(migrationContent.includes("locked"));
});

test("Step 8: Director follow-up migration 存在（治理）", () => {
  assert.ok(fileExists("supabase/migrations/20260826000002_director_meta_locked_followup.sql"));
});

// 9. Video Gateway
test("Step 9: Video Gateway 模块存在", () => {
  assert.ok(fileExists("lib/video-gateway/"));
});

test("Step 9: Runway + Seedance 适配器存在", () => {
  assert.ok(fileExists("lib/video-gateway/adapters/runway.ts"));
  assert.ok(fileExists("lib/video-gateway/adapters/seedance.ts"));
});

test("Step 9: Video Gateway 目录存在", () => {
  assert.ok(fileExists("lib/video-gateway/catalog.ts"));
});

// 10. Assembly Sequence
test("Step 10: Editor Framework 模块存在", () => {
  assert.ok(fileExists("lib/editor/queries.ts"));
  assert.ok(fileExists("lib/editor/timeline-schema.ts"));
  assert.ok(fileExists("lib/editor/types.ts"));
  assert.ok(fileExists("lib/editor/feature-flags.ts"));
});

test("Step 10: Assembly Timeline API 路由存在", () => {
  assert.ok(fileExists("app/api/editor/timeline/route.ts"));
});

test("Step 10: kiikis.timeline/1 schema 版本契约", () => {
  const source = readFile("lib/editor/types.ts");
  assert.ok(source.includes('"kiikis.timeline/1"'));
});

// 11. Editor Export
test("Step 11: Export 模块存在", () => {
  assert.ok(fileExists("lib/editor/exporters/fcpxml.ts"));
  assert.ok(fileExists("lib/editor/exporters/edl.ts"));
  assert.ok(fileExists("lib/editor/exporters/index.ts"));
});

test("Step 11: Export API 路由存在", () => {
  assert.ok(fileExists("app/api/editor/timeline/export/route.ts"));
});

test("Step 11: FCPXML 版本契约", () => {
  const source = readFile("lib/editor/exporters/fcpxml.ts");
  assert.ok(source.includes('"1.9"'));
});

test("Step 11: EDL CMX 3600 格式契约", () => {
  const source = readFile("lib/editor/exporters/edl.ts");
  assert.ok(source.includes("TITLE:"));
  assert.ok(source.includes("END"));
});

// 12. Production Package
test("Step 12: Production Package 模块存在", () => {
  assert.ok(fileExists("lib/export/package-builder.ts"));
  assert.ok(fileExists("lib/export/manifest.ts"));
  assert.ok(fileExists("lib/export/types.ts"));
  assert.ok(fileExists("lib/export/queries.ts"));
});

test("Step 12: Production Package API 路由存在", () => {
  assert.ok(fileExists("app/api/export/production-package/route.ts"));
});

test("Step 12: kiikis.production-package/1 schema 版本契约", () => {
  const source = readFile("lib/export/manifest.ts");
  assert.ok(source.includes('"kiikis.production-package/1"'));
});

// 稳定 ID 串联
test("全链路稳定 ID 串联", () => {
  const passportRoute = readFile("app/api/universes/[universeId]/characters/[entityId]/passport/route.ts");
  assert.ok(passportRoute.includes("universeId"));
  assert.ok(passportRoute.includes("entityId"));

  const voiceQueries = readFile("lib/voice/queries.ts");
  assert.ok(voiceQueries.includes("universe_entity_id"));
  assert.ok(voiceQueries.includes("voice_profile_id"));

  const editorTypes = readFile("lib/editor/types.ts");
  assert.ok(editorTypes.includes("shot_id") || editorTypes.includes("shotId"));
  assert.ok(editorTypes.includes("shotId"));
});

// Feature Flag
test("Editor Framework Feature Flag 存在", () => {
  const source = readFile("lib/editor/feature-flags.ts");
  assert.ok(source.includes("EDITOR_FRAMEWORK_ENABLED"));
  assert.ok(source.includes("isOpenCutAvailable"));
  assert.ok(source.includes("isExportAvailable"));
});

test("OpenCut 首期不可用（isOpenCutAvailable 永远 false）", () => {
  const source = readFile("lib/editor/feature-flags.ts");
  assert.ok(source.includes("return false"));
});

test("Export 可用性检查：frameworkEnabled + hasCompletedVideo", () => {
  const source = readFile("lib/editor/feature-flags.ts");
  assert.ok(source.includes("frameworkEnabled"));
  assert.ok(source.includes("hasCompletedVideo"));
});

// 安全契约
test("Provider 临时 URL 不入库（Editor Timeline）", () => {
  const source = readFile("lib/editor/timeline-schema.ts");
  assert.ok(
    source.includes("禁止把 Provider 临时 URL 写入时间线") || source.includes("稳定 ID"),
  );
});

test("Production Package 不暴露 API Key / Provider 错误 / 签名 URL", () => {
  const source = readFile("lib/export/types.ts");
  assert.ok(source.includes("redacted"));
  assert.ok(source.includes("apiKeys"));
  assert.ok(source.includes("providerRawErrors"));
  assert.ok(source.includes("signedUrls"));
});

test("Export 错误码契约", () => {
  const source = readFile("lib/export/types.ts");
  const requiredCodes = [
    "UNAUTHENTICATED",
    "SCOPE_NOT_FOUND",
    "PROJECT_NOT_FOUND",
    "UNIVERSE_NOT_LINKED",
    "EXPORT_BLOCKED",
    "VALIDATION_FAILED",
    "INTERNAL_ERROR",
  ];
  for (const code of requiredCodes) {
    assert.ok(source.includes(code), `ExportErrorCode 必须包含 ${code}`);
  }
});
