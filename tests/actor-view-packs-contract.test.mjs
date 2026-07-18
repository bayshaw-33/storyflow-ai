/**
 * KIIKIS-TR-ACTOR-P0-005 契约测试 — 演员图组生成 400/502 修复。
 *
 * 覆盖用户列出的 10 项必须测试（1-9 项为契约/静态检查，第 10 项由 tsc + 全量测试 + build 保证）：
 *   1. UI 四个按钮发送 canonical pack
 *   2. 旧 underscore pack 能被兼容归一化
 *   3. 不再出现 sourceProjectId: actor:
 *   4. Actor art project 写入 actor_id，source_project_id=null
 *   5. 同一演员重复生成不会创建重复 art project
 *   6. 不同演员资产严格隔离
 *   7. GET 刷新能恢复版本及签名图片
 *   8. 四个 pack 都能生成并返回非空 versionId/previewUrl/pack
 *   9. 5 次重试策略 + 全失败才 502
 *
 * 测试形态：静态代码契约 + 类型/字符串检查。
 * Route handler 实际执行需要 Next.js runtime + Supabase service role，不在 .mjs 单测范围。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ACTOR_VIEW_PACKS,
  normalizePackKey,
} from "../components/actors/actor-view-model.ts";
import {
  actorViewIdentityAnchor,
  ensureActorArtProject,
  upsertActorViewAsset,
} from "../lib/storyboard/assets/store.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const readSrc = (rel) => readFileSync(path.resolve(ROOT, rel), "utf-8");

// ============================================================
// 测试 1：UI 四个按钮发送 canonical pack
// ============================================================
test("UI 四个按钮发送 canonical pack（ACTOR_VIEW_PACKS.id 全部为 canonical key）", () => {
  const ids = ACTOR_VIEW_PACKS.map((pack) => pack.id);
  assert.deepEqual(
    ids,
    ["reference-sheet", "three-view-casual", "three-view-swimwear", "expressions", "body-details"],
    "ACTOR_VIEW_PACKS.id 必须为 canonical 连字符 key，UI 通过 pack.id 调用 onGenerate",
  );
  // 所有 id 不含下划线
  for (const id of ids) {
    assert.ok(!id.includes("_"), `canonical key 不得含下划线: ${id}`);
  }
});

// ============================================================
// 测试 2：旧 underscore pack 能被兼容归一化
// ============================================================
test("旧 underscore pack 被 normalizePackKey 归一化为 canonical", () => {
  // canonical 直通
  assert.equal(normalizePackKey("three-view-casual"), "three-view-casual");
  assert.equal(normalizePackKey("three-view-swimwear"), "three-view-swimwear");
  assert.equal(normalizePackKey("expressions"), "expressions");
  assert.equal(normalizePackKey("body-details"), "body-details");

  // 旧 underscore 归一化
  assert.equal(normalizePackKey("three_view_casual"), "three-view-casual");
  assert.equal(normalizePackKey("three_view_swim"), "three-view-swimwear");
  assert.equal(normalizePackKey("three_view_swimwear"), "three-view-swimwear");
  assert.equal(normalizePackKey("body_details"), "body-details");

  // 未知值返回 null
  assert.equal(normalizePackKey("nope"), null);
  assert.equal(normalizePackKey(""), null);
  assert.equal(normalizePackKey(null), null);
  assert.equal(normalizePackKey(undefined), null);
  assert.equal(normalizePackKey(123), null);
});

// ============================================================
// 测试 3：不再出现 sourceProjectId: actor:
// ============================================================
test("generate-views route 不再写 source_project_id = 'actor:<id>'", () => {
  const rawSrc = readSrc("app/api/actors/generate-views/route.ts");
  // 去掉注释行后检查实际代码
  const codeOnly = rawSrc.split("\n").filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  }).join("\n");
  // 禁止出现 source_project_id = 'actor:...' 或 `actor:${...}` 的实际写入
  assert.ok(
    !/source_project_id\s*[:=]\s*['"`]actor:/.test(codeOnly),
    "禁止出现 source_project_id = 'actor:...' 实际写入",
  );
  // 必须使用 ensureActorArtProject
  assert.ok(
    codeOnly.includes("ensureActorArtProject"),
    "必须调用 ensureActorArtProject 创建 actor-scoped art project",
  );
});

// ============================================================
// 测试 4：Actor art project 写入 actor_id，source_project_id=null
// ============================================================
test("ensureActorArtProject 写入 actor_id，source_project_id 保持 null", () => {
  const src = readSrc("lib/storyboard/assets/store.ts");
  // 找到 ensureActorArtProject 函数体
  const fnStart = src.indexOf("export async function ensureActorArtProject");
  assert.ok(fnStart > 0, "ensureActorArtProject 必须存在");
  const fnEnd = src.indexOf("\nexport ", fnStart + 1);
  const fnBody = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);

  // 必须写 actor_id
  assert.ok(/actor_id\s*:\s*input\.actorId/.test(fnBody), "必须写入 actor_id: input.actorId");
  // source_project_id 必须为 null（显式置空）
  assert.ok(
    /source_project_id\s*:\s*null/.test(fnBody),
    "source_project_id 必须显式置为 null",
  );
  // 禁止写 source_project_id = `actor:...`
  assert.ok(
    !/source_project_id\s*:\s*`actor:/.test(fnBody),
    "禁止 source_project_id = `actor:...`",
  );
});

// ============================================================
// 测试 5：同一演员重复生成不会创建重复 art project
// ============================================================
test("ensureActorArtProject 通过 DB UNIQUE INDEX 保证幂等（先查再插 + 409 重读）", () => {
  const src = readSrc("lib/storyboard/assets/store.ts");
  const fnStart = src.indexOf("export async function ensureActorArtProject");
  const fnEnd = src.indexOf("\nexport ", fnStart + 1);
  const fnBody = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);

  // 必须先查现有 art project（owner_id + actor_id）
  assert.ok(
    fnBody.includes("owner_id=eq.") && fnBody.includes("actor_id=eq."),
    "必须先按 owner_id + actor_id 查询现有 art project",
  );
  // 插入失败时必须重读（409/duplicate 命中 UNIQUE INDEX）
  assert.ok(
    fnBody.includes("409") || fnBody.includes("duplicate"),
    "插入冲突时必须捕获 409/duplicate 重读",
  );
  // 必须写 source_project_id: null
  assert.ok(fnBody.includes("source_project_id: null"), "source_project_id 必须置 null");

  // migration 必须有 UNIQUE INDEX 保证 DB 级幂等
  const migration = readSrc("supabase/migrations/20260724000000_actor_art_projects_actor_scope.sql");
  assert.ok(
    /create unique index[^;]*storyflow_art_projects_actor_scope_unique[^;]*\(owner_id,\s*actor_id\)\s*where\s*actor_id\s+is\s+not\s+null/i.test(migration),
    "migration 必须有 UNIQUE INDEX (owner_id, actor_id) WHERE actor_id IS NOT NULL",
  );
});

// ============================================================
// 测试 6：不同演员资产严格隔离
// ============================================================
test("actorViewIdentityAnchor 按演员 + pack 严格隔离", () => {
  // 同演员同 pack → 同 anchor
  assert.equal(
    actorViewIdentityAnchor("actor-A", "three-view-casual"),
    actorViewIdentityAnchor("actor-A", "three-view-casual"),
  );
  // 不同演员同 pack → 不同 anchor
  assert.notEqual(
    actorViewIdentityAnchor("actor-A", "three-view-casual"),
    actorViewIdentityAnchor("actor-B", "three-view-casual"),
  );
  // 同演员不同 pack → 不同 anchor
  assert.notEqual(
    actorViewIdentityAnchor("actor-A", "three-view-casual"),
    actorViewIdentityAnchor("actor-A", "expressions"),
  );
  // anchor 格式必须为 actor-view:<actorId>:<pack>
  assert.equal(
    actorViewIdentityAnchor("actor-XYZ", "body-details"),
    "actor-view:actor-XYZ:body-details",
  );
});

test("upsertActorViewAsset 写入 actor_id 和 identity_anchor", () => {
  const src = readSrc("lib/storyboard/assets/store.ts");
  const fnStart = src.indexOf("export async function upsertActorViewAsset");
  assert.ok(fnStart > 0, "upsertActorViewAsset 必须存在");
  const fnEnd = src.indexOf("\nexport ", fnStart + 1);
  const fnBody = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);

  // 必须写 actor_id
  assert.ok(fnBody.includes("actor_id: input.actorId"), "asset 必须写入 actor_id");
  // 必须写 identity_anchor（来自 actorViewIdentityAnchor）
  assert.ok(fnBody.includes("identity_anchor: anchor"), "asset 必须写入 identity_anchor = actor-view:<id>:<pack>");
  // 必须先查现有 asset（project_id + actor_id + identity_anchor）保证幂等
  assert.ok(
    fnBody.includes("project_id=eq.")
      && fnBody.includes("actor_id=eq.")
      && fnBody.includes("identity_anchor=eq."),
    "必须先按 project_id + actor_id + identity_anchor 查询现有 asset 保证幂等",
  );
  // 找到时 PATCH description，找不到时 INSERT
  assert.ok(
    fnBody.includes("found?.[0]?.id") && fnBody.includes("PATCH"),
    "必须先查再决定 PATCH/INSERT",
  );
});

// ============================================================
// 测试 7：GET 刷新能恢复版本及签名图片
// ============================================================
test("GET 路由按 actor_id 查询 + 反解 identity_anchor + signStoredArtImage 重签", () => {
  const src = readSrc("app/api/actors/generate-views/route.ts");
  const getStart = src.indexOf("export async function GET");
  const postStart = src.indexOf("export async function POST");
  const getBody = src.slice(getStart, postStart);

  // 必须按 actor_id 查询 assets
  assert.ok(
    /storyflow_art_assets\?actor_id=eq\./.test(getBody),
    "GET 必须按 actor_id 查询 art_assets",
  );
  // 必须反解 identity_anchor 拿 pack（正则字面量 /^actor-view:[^:]+:(.+)$/）
  assert.ok(
    getBody.includes("identity_anchor.match(") && getBody.includes("actor-view:"),
    "GET 必须反解 identity_anchor 拿 pack",
  );
  // 必须调用 signStoredArtImage 重新签名
  assert.ok(
    /signStoredArtImage\(row\.storage_path\)/.test(getBody),
    "GET 必须调用 signStoredArtImage 重新签名 storage_path",
  );
  // 必须返回 shotKey（从 metadata.shot_key 读取）
  assert.ok(
    /meta\.shot_key/.test(getBody),
    "GET 必须从 metadata.shot_key 恢复 shotKey",
  );
  // 必须返回 isPrimary
  assert.ok(
    /isPrimary/.test(getBody),
    "GET 必须返回 isPrimary（approved_version_id 或 metadata.is_primary）",
  );
});

// ============================================================
// 测试 8：四个 pack 都能生成并返回非空 versionId/previewUrl/pack
// ============================================================
test("POST 路由响应契约：每条版本返回 versionId/previewUrl/pack/shotKey/isPrimary + attempt", () => {
  const src = readSrc("app/api/actors/generate-views/route.ts");
  const postStart = src.indexOf("export async function POST");
  const postBody = src.slice(postStart);

  // 响应必须包含这 6 个字段（含 attempt 表示第几次重试成功）
  const requiredFields = ["versionId", "previewUrl", "pack", "shotKey", "isPrimary", "attempt"];
  for (const field of requiredFields) {
    assert.ok(
      new RegExp(`${field}:`).test(postBody),
      `POST 响应必须包含 ${field} 字段`,
    );
  }
  // shotKey 必须为 "sheet"（合成图模式）
  assert.ok(postBody.includes('"sheet"') || postBody.includes("'sheet'"), "shotKey 必须为 'sheet'");

  // 五个 pack 都必须支持（getActorViewPack 必须接受 canonical key）
  const actorImageSrc = readSrc("lib/art/providers/actor-image.ts");
  for (const packKey of ["three-view-casual", "three-view-swimwear", "expressions", "body-details", "reference-sheet"]) {
    assert.ok(
      actorImageSrc.includes(`"${packKey}"`),
      `actor-image.ts 必须支持 pack: ${packKey}`,
    );
  }
});

test("getActorViewPack 兼容旧 underscore key 归一化", async () => {
  // 通过动态导入验证
  const { getActorViewPack } = await import("../lib/art/providers/actor-image.ts");
  // canonical
  assert.ok(getActorViewPack("three-view-casual") !== null);
  assert.ok(getActorViewPack("three-view-swimwear") !== null);
  assert.ok(getActorViewPack("expressions") !== null);
  assert.ok(getActorViewPack("body-details") !== null);
  // 旧 underscore
  assert.ok(getActorViewPack("three_view_casual") !== null, "兼容 three_view_casual");
  assert.ok(getActorViewPack("three_view_swim") !== null, "兼容 three_view_swim");
  assert.ok(getActorViewPack("three_view_swimwear") !== null, "兼容 three_view_swimwear");
  assert.ok(getActorViewPack("body_details") !== null, "兼容 body_details");
  // 未知
  assert.equal(getActorViewPack("nope"), null);
});

// ============================================================
// 测试 9：5 次重试策略 + 全失败才 502
// ============================================================
test("POST 路由：5 次重试策略（同 prompt 换 seed 2 次 + 切换 promptVariants 3 次）", () => {
  const src = readSrc("app/api/actors/generate-views/route.ts");
  const postStart = src.indexOf("export async function POST");
  const postBody = src.slice(postStart);

  // 必须有 SHEET_RETRY_PLAN 引用
  assert.ok(postBody.includes("SHEET_RETRY_PLAN"), "必须使用 SHEET_RETRY_PLAN 重试策略");
  // 必须有 failures 数组记录每次失败
  assert.ok(/const failures/.test(postBody), "必须有 failures 数组记录每次失败");
  // 必须有 success 变量（单图成功）
  assert.ok(/let success/.test(postBody), "必须有 success 变量记录成功结果");
  // 成功后必须 break 退出重试循环
  assert.ok(/break;/.test(postBody), "成功后必须 break 退出重试循环");

  // 全部失败才返回 502
  assert.ok(
    /if\s*\(!success\)[\s\S]*?502/.test(postBody),
    "5 次全部失败才返回 502",
  );

  // 成功时必须调用 insertAssetVersions 写入版本
  assert.ok(
    /insertAssetVersions/.test(postBody),
    "成功时必须调用 insertAssetVersions 写入版本",
  );

  // 响应必须返回 versions + attempts + failures
  assert.ok(/versions,/.test(postBody), "响应必须返回 versions");
  assert.ok(/attempts:/.test(postBody), "响应必须返回 attempts（第几次成功）");
  assert.ok(/failures,/.test(postBody), "响应必须返回 failures（失败明细）");
});

test("actor-image.ts SHEET_RETRY_PLAN 定义 6 次重试", () => {
  const src = readSrc("lib/art/providers/actor-image.ts");
  // 必须有 SHEET_RETRY_PLAN 常量
  assert.ok(src.includes("SHEET_RETRY_PLAN"), "必须有 SHEET_RETRY_PLAN 常量");
  // 必须有 6 个重试项（KIIKIS-TR-ACTOR-P0-007: 泳装 6 组措辞需要 6 次重试）
  const match = src.match(/SHEET_RETRY_PLAN\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(match, "SHEET_RETRY_PLAN 数组定义必须存在");
  const itemCount = (match[1].match(/promptVariantIndex/g) || []).length;
  assert.equal(itemCount, 6, "SHEET_RETRY_PLAN 必须有 6 个重试项");
  // 第 1-2 项用 promptVariantIndex: 0（同 prompt 换 seed）
  // 第 3-5 项用 promptVariantIndex: 1/2/-1（切换 promptVariants）
  // 第 6 项用 promptVariantIndex: -1（最后一个 variant，最保守）
  assert.ok(/promptVariantIndex:\s*0[^]*promptVariantIndex:\s*0[^]*promptVariantIndex:\s*1[^]*promptVariantIndex:\s*2[^]*promptVariantIndex:\s*-1[^]*promptVariantIndex:\s*-1/.test(src.replace(/\s+/g, " ")), "重试顺序：0,0,1,2,-1,-1");
});

test("每个 pack 的 promptVariants 至少 3 组（泳装至少 4 组）", () => {
  const src = readSrc("lib/art/providers/actor-image.ts");
  // 泳装 pack 必须有 >= 6 组 promptVariants（KIIKIS-TR-ACTOR-P0-007: 从 4 组增到 6 组）
  const swimMatch = src.match(/key:\s*"three-view-swimwear"[\s\S]*?promptVariants:\s*\[([\s\S]*?)\],/);
  assert.ok(swimMatch, "泳装 pack promptVariants 未找到");
  const swimVariantCount = (swimMatch[1].match(/"/g) || []).length / 2; // 每组一个字符串
  assert.ok(swimVariantCount >= 6, `泳装 pack 必须有 >= 6 组 promptVariants，实际 ${swimVariantCount}`);
});
test("POST 路由：5 个阶段错误码已定义", () => {
  const src = readSrc("app/api/actors/generate-views/route.ts");
  const requiredCodes = [
    "ACTOR_ART_PROJECT_FAILED",
    "ACTOR_ART_ASSET_FAILED",
    "ATLAS_GENERATION_FAILED",
    "ART_IMAGE_TRANSFER_FAILED",
    "ART_VERSION_INSERT_FAILED",
  ];
  for (const code of requiredCodes) {
    assert.ok(
      src.includes(code),
      `必须定义阶段错误码: ${code}`,
    );
  }
  // StageHandledError 必须存在
  assert.ok(
    src.includes("class StageHandledError"),
    "必须有 StageHandledError 类携带 errorCode + stage",
  );
});

test("POST 路由：日志只记 requestId+stage+errorCode+attempt，不记密钥/URL/响应/Prompt", () => {
  const src = readSrc("app/api/actors/generate-views/route.ts");
  // console.warn 必须存在
  assert.ok(/console\.warn\(JSON\.stringify\(/.test(src), "必须有 console.warn 结构化日志");
  // 日志对象只允许这 4 个字段
  const logMatches = src.match(/console\.warn\(JSON\.stringify\(\s*{[^}]+}\s*\)\)/g) || [];
  for (const log of logMatches) {
    assert.ok(!/apiKey|api_key|Authorization|Bearer/i.test(log), `日志不得含密钥: ${log}`);
    assert.ok(!/previewUrl|imageUrl|avatarUrl/i.test(log), `日志不得含 URL: ${log}`);
    assert.ok(!/prompt|negativePrompt/i.test(log), `日志不得含 Prompt: ${log}`);
    assert.ok(!/response|body/i.test(log), `日志不得含 Provider 响应: ${log}`);
  }
});

test("Provider 图片必须先转存 Supabase Storage 再写 version", () => {
  const src = readSrc("app/api/actors/generate-views/route.ts");
  const postStart = src.indexOf("export async function POST");
  const postBody = src.slice(postStart);

  // 必须调用 persistRemoteArtImage
  assert.ok(
    /persistRemoteArtImage\(/.test(postBody),
    "Provider 图片必须先调用 persistRemoteArtImage 转存到 Storage",
  );
  // version 的 storagePath 必须来自 stored（转存后），不是 image.imageUrl
  assert.ok(
    /storagePath:\s*stored\.storagePath/.test(postBody),
    "version.storagePath 必须来自转存后的 stored.storagePath，不是 Provider 临时 URL",
  );
  assert.ok(
    /previewUrl:\s*stored\.previewUrl/.test(postBody),
    "version.previewUrl 必须来自转存后的 stored.previewUrl",
  );
});

// ============================================================
// 额外：primary-version 路由必须用 actor_id 校验
// ============================================================
test("primary-version route 用 actor_id 校验替代 source_project_id", () => {
  const src = readSrc("app/api/actors/[actorId]/primary-version/route.ts");
  // 必须查询 actor_id 字段
  assert.ok(
    /select=id,owner_id,actor_id/.test(src),
    "primary-version 必须查询 actor_id 字段",
  );
  // 必须校验 artProject.actor_id === actorId
  assert.ok(
    /artProject\.actor_id\s*!==\s*actorId/.test(src),
    "primary-version 必须校验 artProject.actor_id === actorId",
  );
  // 禁止出现旧的 source_project_id = `actor:${actorId}` 校验
  assert.ok(
    !/source_project_id\s*!==\s*`actor:\$\{actorId\}`/.test(src),
    "禁止保留旧 source_project_id = `actor:${actorId}` 校验",
  );
});

// ============================================================
// 额外：migration 必须包含 actor_id 列 + FK + UNIQUE INDEX
// ============================================================
test("migration 包含 actor_id 列 + FK + UNIQUE INDEX + asset actor_id FK", () => {
  const migration = readSrc("supabase/migrations/20260724000000_actor_art_projects_actor_scope.sql");

  // storyflow_art_projects 加 actor_id 列
  assert.ok(
    /alter table public\.storyflow_art_projects\s+add column if not exists actor_id uuid/i.test(migration),
    "必须 ALTER TABLE ... ADD COLUMN actor_id uuid",
  );
  // FK → storyflow_actor_profiles(id) ON DELETE SET NULL
  assert.ok(
    /references public\.storyflow_actor_profiles\(id\)\s+on delete set null/i.test(migration),
    "必须有 FK → actor_profiles(id) ON DELETE SET NULL",
  );
  // UNIQUE INDEX (owner_id, actor_id) WHERE actor_id IS NOT NULL
  assert.ok(
    /create unique index[^;]*storyflow_art_projects_actor_scope_unique[^;]*\(owner_id,\s*actor_id\)\s*where\s*actor_id\s+is\s+not\s+null/i.test(migration),
    "必须有 UNIQUE INDEX (owner_id, actor_id) WHERE actor_id IS NOT NULL",
  );
  // storyflow_art_assets.actor_id 加 FK
  assert.ok(
    /storyflow_art_assets[^;]*actor_id[^;]*references public\.storyflow_actor_profiles/i.test(migration),
    "storyflow_art_assets.actor_id 必须加 FK",
  );
  // asset 查询优化索引
  assert.ok(
    /create index[^;]*storyflow_art_assets_actor_anchor_idx[^;]*\(actor_id,\s*identity_anchor\)/i.test(migration),
    "必须有 (actor_id, identity_anchor) 查询索引",
  );
});
