/**
 * actors-edit-profile tests — KIIKIS-TR-ACTOR-P0-004 Commit 3
 *
 * 修复目标（验收 #6 #7 #8）：
 * - 详情页"编辑"按钮接通 PATCH API（不再 disabled）
 * - 创建者可编辑所有基础资料字段
 * - 空字段不覆盖已有内容（mergeActorUpdate）
 * - metadata 深合并（mergeActorMetadata，禁止整对象误覆盖）
 * - 保存成功立即刷新卡片和详情页
 * - 保存失败保留用户尚未提交的内容
 * - 非创建者不得编辑、删除或更换演员基础形象（assertCanEditActorBasicProfile）
 *
 * 运行：node --test tests/actors-edit-profile.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// === 1. lib/actors.ts: mergeActorUpdate 函数存在 ===
test("lib/actors.ts: export mergeActorUpdate + mergeActorMetadata", async () => {
  const src = await read("../lib/actors.ts");
  assert.match(src, /export function mergeActorUpdate\(/, "必须 export mergeActorUpdate");
  assert.match(src, /export function mergeActorMetadata\(/, "必须 export mergeActorMetadata");
});

// === 2. mergeActorUpdate: 空字段不覆盖已有内容 ===
test("lib/actors.ts: mergeActorUpdate 空字段不覆盖已有内容", async () => {
  const src = await read("../lib/actors.ts");
  // 必须用 keepText 模式（incoming || fallback）
  assert.match(src, /const keepText = \(incoming:[^,]+, fallback:[^)]+\) => incoming \|\| cleanText\(fallback\)/, "必须有 keepText helper");
  assert.match(src, /const keepTags = \(incoming:[^,]+, fallback:[^)]+\) => \(incoming\.length \? incoming : normalizeTags\(fallback\)\)/, "必须有 keepTags helper");
  // name/bio/age_range 等字段必须用 keepText
  assert.match(src, /name: keepText\(normalized\.name, existing\.name\)/, "name 必须用 keepText");
  assert.match(src, /bio: keepText\(normalized\.bio, existing\.bio\)/, "bio 必须用 keepText");
  assert.match(src, /age_range: keepText\(normalized\.age_range, existing\.age_range\)/, "age_range 必须用 keepText");
  // temperament/playable_roles 必须用 keepTags
  assert.match(src, /temperament: keepTags\(normalized\.temperament, existing\.temperament\)/, "temperament 必须用 keepTags");
  assert.match(src, /playable_roles: keepTags\(normalized\.playable_roles, existing\.playable_roles\)/, "playable_roles 必须用 keepTags");
});

// === 3. mergeActorMetadata: 深合并 identity_passport ===
test("lib/actors.ts: mergeActorMetadata 深合并 identity_passport 二级字段", async () => {
  const src = await read("../lib/actors.ts");
  // 必须有 identity_passport 二级合并
  assert.match(src, /existingPassport/, "必须有 existingPassport");
  assert.match(src, /incomingPassport/, "必须有 incomingPassport");
  // 三个 prompt 字段都必须保留 existing + 空字符串不覆盖
  assert.match(src, /identity_core_prompt: existingPassport\.identity_core_prompt/, "必须保留 existing identity_core_prompt");
  assert.match(src, /current_appearance_prompt: existingPassport\.current_appearance_prompt/, "必须保留 existing current_appearance_prompt");
  assert.match(src, /scene_override_prompt: existingPassport\.scene_override_prompt/, "必须保留 existing scene_override_prompt");
  // 空字符串不覆盖（条件展开）
  assert.match(src, /\.\.\.\(incomingPassport\.identity_core_prompt \? \{ identity_core_prompt: incomingPassport\.identity_core_prompt \} : \{\}\)/, "identity_core_prompt 空字符串不覆盖");
});

// === 4. lib/supabase/actors.ts: assertCanEditActorBasicProfile 函数 ===
test("lib/supabase/actors.ts: assertCanEditActorBasicProfile 仅创建者可写", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // 函数定义
  assert.match(src, /async function assertCanEditActorBasicProfile\(userId: string, actor: ActorProfile\)/, "函数必须存在");
  // 必须只检查 owner_id === userId
  assert.match(src, /if \(actor\.owner_id === userId\) return;/, "必须只检查 owner_id === userId");
  // 非创建者抛 ACTOR_FORBIDDEN
  assert.match(src, /throw new Error\("ACTOR_FORBIDDEN"\)/, "非创建者必须抛 ACTOR_FORBIDDEN");
  // 不得检查 team_id（与 assertCanEditActor 区别）
  const idx = src.indexOf("async function assertCanEditActorBasicProfile");
  // slice 缩小到 200 字符，避免 bleed 到下一个 assertTeamRole 函数（该函数含 team_id）
  const slice = src.slice(idx, idx + 200);
  assert.doesNotMatch(slice, /team_id/, "assertCanEditActorBasicProfile 不得检查 team_id");
});

// === 5. updateActorForUser 用 assertCanEditActorBasicProfile + mergeActorUpdate ===
test("lib/supabase/actors.ts: updateActorForUser 用 assertCanEditActorBasicProfile + mergeActorUpdate", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("export async function updateActorForUser");
  assert.ok(idx >= 0);
  const slice = src.slice(idx, idx + 1500);
  // 必须调用 assertCanEditActorBasicProfile
  assert.match(slice, /await assertCanEditActorBasicProfile\(userId, actor\)/, "必须用 assertCanEditActorBasicProfile");
  // 不得调用 assertCanEditActor（旧版允许团队 admin）
  assert.doesNotMatch(slice, /await assertCanEditActor\(userId, actor\)/, "不得用 assertCanEditActor");
  // 必须调用 mergeActorUpdate
  assert.match(slice, /mergeActorUpdate\(actor, input\)/, "必须用 mergeActorUpdate 合并");
  // 不得用旧的 normalizeActorInput({ ...actor, ...input }) 直接合并
  assert.doesNotMatch(slice, /normalizeActorInput\(\{ \.\.\.actor, \.\.\.input \}\)/, "不得用旧的直接 spread 合并");
});

// === 6. archiveActorForUser 用 assertCanEditActorBasicProfile ===
test("lib/supabase/actors.ts: archiveActorForUser 用 assertCanEditActorBasicProfile", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("export async function archiveActorForUser");
  const slice = src.slice(idx, idx + 600);
  assert.match(slice, /await assertCanEditActorBasicProfile\(userId, actor\)/, "archiveActorForUser 必须用 assertCanEditActorBasicProfile");
});

// === 7. saveActorPrompt 用 assertCanEditActorBasicProfile ===
test("lib/supabase/actors.ts: saveActorPrompt 用 assertCanEditActorBasicProfile", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // saveActorPrompt 中 if (actorId) await assertCanEditActorBasicProfile(userId, actor as ActorProfile)
  assert.match(src, /if \(actorId\) await assertCanEditActorBasicProfile\(userId, actor as ActorProfile\)/, "saveActorPrompt 必须用 assertCanEditActorBasicProfile");
});

// === 8. saveGeneratedActorImage 用 assertCanEditActorBasicProfile ===
test("lib/supabase/actors.ts: saveGeneratedActorImage 用 assertCanEditActorBasicProfile", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("export async function saveGeneratedActorImage");
  const slice = src.slice(idx, idx + 2500);
  assert.match(slice, /await assertCanEditActorBasicProfile\(params\.userId, actor\)/, "saveGeneratedActorImage 必须用 assertCanEditActorBasicProfile");
});

// === 9. upsertAppearanceVariant 仍用 assertCanEditActor（项目形象允许团队 admin）===
test("lib/supabase/actors.ts: upsertAppearanceVariant 不调 assertCanEditActorBasicProfile", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("export async function upsertAppearanceVariant");
  const slice = src.slice(idx, idx + 2000);
  // upsertAppearanceVariant 只调 getActorForUser（读权限），不调 assertCanEditActorBasicProfile
  assert.doesNotMatch(slice, /assertCanEditActorBasicProfile/, "upsertAppearanceVariant 不得调 assertCanEditActorBasicProfile（项目形象允许团队/平台用户创建）");
});

// === 10. EditActorModal 组件存在且实现关键功能 ===
test("components/actors/EditActorModal.tsx: 关键功能实现", async () => {
  const src = await read("../components/actors/EditActorModal.tsx");
  // 必须用 actorApiFetch PATCH /api/actors
  assert.match(src, /actorApiFetch<\{ actor: ActorProfile \}>\("\/api\/actors", token, \{\s*method: "PATCH"/, "必须 PATCH /api/actors");
  // 必须传 id 字段
  assert.match(src, /id: actor\.id/, "PATCH body 必须含 id");
  // 必须支持 visibility 字段
  assert.match(src, /visibility/, "必须支持 visibility 字段");
  // 必须用 processAvatarImage + uploadProcessedAvatar（与 CreateActorModal 一致）
  assert.match(src, /import\s*\{\s*processAvatarImage,\s*uploadProcessedAvatar\s*\}\s*from\s*"@\/lib\/avatar-processing"/, "必须导入头像处理函数");
  // 必须预填字段（initialized state 模式）
  assert.match(src, /if \(open && actor && !initialized\)/, "必须有预填逻辑");
  // 保存失败不 reset（保留用户输入）
  // 错误分支只 setError，不调 reset
  assert.match(src, /setError\(issue instanceof Error \? issue\.message : copy\.editFailed\)/, "保存失败只 setError");
  // 保存成功才 setInitialized(false) + onUpdated
  assert.match(src, /setInitialized\(false\);\s*onUpdated\(result\.actor\)/, "保存成功才 reset + 回调");
});

// === 11. EditActorModal: 支持编辑的字段列表 ===
test("components/actors/EditActorModal.tsx: 支持编辑所有基础资料字段", async () => {
  const src = await read("../components/actors/EditActorModal.tsx");
  // 必须包含所有可编辑字段
  const fields = [
    "name", "ageRange", "gender", "ethnicity",
    "faceDesc", "hairDesc", "bodyDesc",
    "temperament", "roles", "bio",
    "basePrompt", "negativePrompt",
    "visibility", "avatarAssetId"
  ];
  for (const field of fields) {
    assert.ok(src.includes(field), `必须包含字段: ${field}`);
  }
  // body 必须传这些字段
  assert.match(src, /name: name\.trim\(\)/, "body 必须传 name");
  assert.match(src, /age_range: ageRange\.trim\(\)/, "body 必须传 age_range");
  assert.match(src, /gender_expression: gender\.trim\(\)/, "body 必须传 gender_expression");
  assert.match(src, /ethnicity_style: ethnicity\.trim\(\)/, "body 必须传 ethnicity_style");
  assert.match(src, /face_description: faceDesc\.trim\(\)/, "body 必须传 face_description");
  assert.match(src, /hair_description: hairDesc\.trim\(\)/, "body 必须传 hair_description");
  assert.match(src, /body_description: bodyDesc\.trim\(\)/, "body 必须传 body_description");
  assert.match(src, /temperament: normalizeTagList\(temperament\)/, "body 必须传 temperament");
  assert.match(src, /playable_roles: normalizeTagList\(roles\)/, "body 必须传 playable_roles");
  assert.match(src, /bio: bio\.trim\(\)/, "body 必须传 bio");
  assert.match(src, /base_prompt: basePrompt\.trim\(\)/, "body 必须传 base_prompt");
  assert.match(src, /negative_prompt: negativePrompt\.trim\(\)/, "body 必须传 negative_prompt");
  assert.match(src, /visibility/, "body 必须传 visibility");
  // avatar_asset_id 仅在新上传时传
  assert.match(src, /if \(avatarAssetId\) body\.avatar_asset_id = avatarAssetId/, "avatar_asset_id 仅在新上传时传");
});

// === 12. 详情页编辑按钮接入 ===
test("app/actors/[actorId]/page.tsx: 编辑按钮接通 EditActorModal", async () => {
  const src = await read("../app/actors/[actorId]/page.tsx");
  // 必须 import EditActorModal
  assert.match(src, /import \{ EditActorModal \} from "@\/components\/actors\/EditActorModal"/, "必须 import EditActorModal");
  // 必须有 editModalOpen state
  assert.match(src, /const \[editModalOpen, setEditModalOpen\] = useState\(false\)/, "必须有 editModalOpen state");
  // 必须有 isCreator 判断
  assert.match(src, /const isCreator = Boolean\(actor && session\?\.user\?\.id && actor\.owner_id === session\.user\.id\)/, "必须有 isCreator 判断");
  // 编辑按钮必须有 onClick={() => setEditModalOpen(true)}
  assert.match(src, /onClick=\{\(\) => setEditModalOpen\(true\)\}/, "编辑按钮必须 onClick 打开模态框");
  // 不得再有 disabled 无 onClick 的旧按钮
  assert.doesNotMatch(src, /disabled\s*\n\s*title=\{isZh \? "编辑入口暂未开放/, "不得保留旧 disabled 按钮");
  // 必须渲染 EditActorModal 组件
  assert.match(src, /<EditActorModal/, "必须渲染 EditActorModal");
  // 必须传 onUpdated 回调刷新 actor state
  assert.match(src, /onUpdated=\{\(updated\) => \{\s*setActor\(updated\)/, "必须传 onUpdated 回调刷新 actor state");
  // 非创建者不显示编辑按钮（条件渲染）
  assert.match(src, /\{isCreator \? \(\s*<button/, "编辑按钮必须按 isCreator 条件渲染");
});

// === 13. actor-copy.ts: 新增编辑相关文案（中英）===
test("actor-copy.ts: 中英文均包含编辑相关文案", async () => {
  const src = await read("../components/actors/actor-copy.ts");
  const keys = [
    "editTitle", "editSubmit", "editing", "editFailed",
    "editAvatarReplace", "visibilityLabel", "visibilityPrivate",
    "visibilityTeam", "editNotCreator",
  ];
  for (const key of keys) {
    const matches = src.split(key).length - 1;
    assert.ok(matches >= 2, `${key} 必须在 zh 和 en 各出现一次，实际 ${matches}`);
  }
});

// === 14. lib/actors.ts: mergeActorUpdate 的 avatar_asset_id 仅在 input 提供时采用 ===
test("lib/actors.ts: mergeActorUpdate avatar_asset_id 不传则保留 existing", async () => {
  const src = await read("../lib/actors.ts");
  // avatar_asset_id: input.avatar_asset_id || existing.avatar_asset_id || null
  assert.match(src, /avatar_asset_id: input\.avatar_asset_id \|\| existing\.avatar_asset_id \|\| null/, "avatar_asset_id 必须按优先级合并");
});

// === 15. lib/supabase/actors.ts: updateActorForUser 中 metadata 用 merged.metadata ===
test("lib/supabase/actors.ts: updateActorForUser 中 patch.metadata 用 normalized.metadata（来自 mergeActorUpdate）", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("export async function updateActorForUser");
  const slice = src.slice(idx, idx + 2500);
  // patch.metadata 必须来自 normalized.metadata（即 mergeActorUpdate 的输出）
  assert.match(slice, /metadata: normalized\.metadata \|\| undefined/, "patch.metadata 必须用 normalized.metadata");
});

// === 16. EditActorModal: 头像上传错误映射 ===
test("components/actors/EditActorModal.tsx: mapAvatarError 覆盖 4 个错误码", async () => {
  const src = await read("../components/actors/EditActorModal.tsx");
  assert.match(src, /AVATAR_TYPE_UNSUPPORTED/, "必须映射 AVATAR_TYPE_UNSUPPORTED");
  assert.match(src, /AVATAR_RAW_SIZE_EXCEEDS_20MB/, "必须映射 AVATAR_RAW_SIZE_EXCEEDS_20MB");
  assert.match(src, /AVATAR_BITMAP_DECODE_FAILED/, "必须映射 AVATAR_BITMAP_DECODE_FAILED");
  assert.match(src, /AVATAR_UPLOAD/, "必须映射 AVATAR_UPLOAD*");
});

// === 17. 详情页非创建者不显示编辑按钮（仅创建者可见）===
test("app/actors/[actorId]/page.tsx: 非创建者不渲染编辑按钮", async () => {
  const src = await read("../app/actors/[actorId]/page.tsx");
  // 必须有 {isCreator ? (<button>...</button>) : null} 模式
  assert.match(src, /\{isCreator \? \([\s\S]*?<button[\s\S]*?\) : null\}/, "必须有 isCreator 条件渲染");
});

// === 18. lib/actors.ts: mergeActorUpdate 的 visibility 总是采用 input ===
// Commit 4 更新：existing.visibility 继承分支加入 platform（private/team/platform 三态）
test("lib/actors.ts: mergeActorUpdate visibility 总是采用 input（用户可主动改共享范围）", async () => {
  const src = await read("../lib/actors.ts");
  // visibility: input.visibility ? normalized.visibility : (existing.visibility === "team" ? "team" : existing.visibility === "platform" ? "platform" : "private")
  assert.match(src, /visibility: input\.visibility \? normalized\.visibility : \(existing\.visibility === "team" \? "team" : existing\.visibility === "platform" \? "platform" : "private"\)/, "visibility 必须按 input 优先，existing 继承含 platform");
});
