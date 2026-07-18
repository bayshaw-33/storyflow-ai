/**
 * actors-postgrest-fix tests — KIIKIS-TR-ACTOR-P0-004 Commit 1
 *
 * 修复目标：
 * - PostgREST or()/and() 内部必须用 col.op.val 点号语法（不能用 col=op.val）
 * - team 表达式放 or() 首项，规避 owner_id 的 o 前缀被 PGRST100 词法器误吞
 * - 删除 lib/supabase/actors.ts 中重复的 ensureServiceRole() 调用
 * - 错误响应保留真实错误码（不掩盖 PGRST204/42703/42P01/PGRST205）
 *
 * 覆盖三种用户场景：
 * - 无团队用户：走顶层 owner 过滤路径（不进入 or()）
 * - 单团队用户：or=(team_expr,owner_id.eq.X)
 * - 多团队用户：or=(team_expr_with_multiple_ids,owner_id.eq.X)
 *
 * 运行：node --test tests/actors-postgrest-fix.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// === 1. actors.ts: or() 内部使用 owner_id.eq. 点号语法 ===
// Commit 4 更新：无团队路径不再用 ownerTop，改为 or=(visibility.eq.platform,owner_id.eq.X)
// 原因：platform 共享演员对所有 authenticated 可见，无团队用户也需看到平台共享演员。
test("actors.ts: listStructuredActorsForUser or() 内部使用 owner_id.eq. 点号语法", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // 必须有 ownerInOr = `owner_id.eq.${userIdEnc}`（or() 内部用）
  assert.match(src, /ownerInOr\s*=\s*`owner_id\.eq\.\$\{userIdEnc\}`/, "必须有 ownerInOr 点号语法变量");
  // accessQuery 有团队路径：or=(visibility.eq.platform,teamExpr,ownerInOr)
  assert.match(src, /accessQuery\s*=\s*teamExpr\s*\?\s*`or=\(visibility\.eq\.platform,\$\{teamExpr\},\$\{ownerInOr\}\)`/, "有团队路径：or=(platform,team,owner)");
  // accessQuery 无团队路径：or=(visibility.eq.platform,ownerInOr)
  assert.match(src, /:\s*`or=\(visibility\.eq\.platform,\$\{ownerInOr\}\)`/, "无团队路径：or=(platform,owner)");
  // 禁止 or=(...owner_id=eq.X...)（旧 bug 语法）
  assert.doesNotMatch(src, /or=\([^)]*owner_id=eq\./, "or() 内部不得出现 owner_id=eq. 旧语法");
});

// === 2. actors.ts: team 表达式使用 and() 点号语法（不带 =）===
test("actors.ts: team 表达式使用 and() 点号语法", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // and(visibility.eq.team,team_id.in.(...)) — 点号语法
  assert.match(src, /and\(visibility\.eq\.team,team_id\.in\./, "team 表达式用 and() 点号语法");
  // 禁止 and=( 旧语法
  assert.doesNotMatch(src, /and=\(/, "不得使用 and=( 旧语法");
});

// === 3. portrayals/route.ts: 修复 or() + and() 语法 ===
test("portrayals/route.ts: or() 内部使用点号语法，team 表达式放首项", async () => {
  const src = await read("../app/api/actors/portrayals/route.ts");
  // 禁止 and=( 旧语法
  assert.doesNotMatch(src, /and=\(/, "portrayals/route.ts 不得使用 and=( 旧语法");
  // 禁止 or=(...owner_id=eq....) 旧语法
  assert.doesNotMatch(src, /or=\([^)]*owner_id=eq\./, "portrayals/route.ts or() 内部不得使用 owner_id=eq. 旧语法");
  // 必须有 ownerInOr = `owner_id.eq.${userIdEnc}`
  assert.match(src, /ownerInOr\s*=\s*`owner_id\.eq\.\$\{userIdEnc\}`/, "portrayals/route.ts 必须有 ownerInOr 点号语法变量");
  // 必须有 team_id.in.（点号语法）
  assert.match(src, /team_id\.in\./, "portrayals/route.ts 必须有 team_id.in. 点号语法");
  // or() 中 team 表达式放首项
  assert.match(src, /or=\(\$\{teamExpr\},\$\{ownerInOr\}\)/, "portrayals/route.ts or() 中 teamExpr 放首项");
});

// === 4. portrayals/counts/route.ts: 修复 or() 语法 ===
test("portrayals/counts/route.ts: or() 内部使用点号语法", async () => {
  const src = await read("../app/api/actors/portrayals/counts/route.ts");
  // 禁止 team_id=in. 旧语法（必须用 team_id.in.）
  assert.doesNotMatch(src, /team_id=in\./, "portrayals/counts/route.ts 不得使用 team_id=in. 旧语法");
  // 禁止 or=(...owner_id=eq....) 旧语法
  assert.doesNotMatch(src, /or=\([^)]*owner_id=eq\./, "portrayals/counts/route.ts or() 内部不得使用 owner_id=eq. 旧语法");
  // 必须有 ownerInOr = `owner_id.eq.${userIdEnc}`
  assert.match(src, /ownerInOr\s*=\s*`owner_id\.eq\.\$\{userIdEnc\}`/, "portrayals/counts/route.ts 必须有 ownerInOr 点号语法变量");
  // 必须有 team_id.in.（点号语法）
  assert.match(src, /team_id\.in\./, "portrayals/counts/route.ts 必须有 team_id.in. 点号语法");
  // or() 中 team 表达式放首项
  assert.match(src, /or=\(\$\{teamExpr\},\$\{ownerInOr\}\)/, "portrayals/counts/route.ts or() 中 teamExpr 放首项");
});

// === 5. actors.ts: 删除重复 ensureServiceRole() ===
test("actors.ts: 调用 getActorForUser 的函数不再重复 ensureServiceRole()", async () => {
  const src = await read("../lib/supabase/actors.ts");

  // 统计 ensureServiceRole() 调用次数（排除注释和函数定义）
  // 原始：11 次（listTeamsForUser, createTeamForUser, listActorLibraryForUser, getActorForUser,
  //                createActorForUser, updateActorForUser, archiveActorForUser, saveActorPrompt,
  //                saveGeneratedActorImage, listAppearanceVariantsForProject, upsertAppearanceVariant）
  // 修复后：7 次（移除 updateActorForUser, archiveActorForUser, saveGeneratedActorImage, upsertAppearanceVariant）
  const lines = src.split("\n");
  let callCount = 0;
  for (const line of lines) {
    // 排除注释行
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) continue;
    // 排除函数定义行：function ensureServiceRole()
    if (/^\s*function\s+ensureServiceRole/.test(line)) continue;
    // 匹配实际调用：行内有 ensureServiceRole() 且不是注释
    const codePart = line.split("//")[0]; // 取注释前部分
    if (/ensureServiceRole\(\)/.test(codePart)) {
      callCount++;
    }
  }
  assert.equal(callCount, 7, `ensureServiceRole() 调用次数应为 7（移除 4 个重复），实际 ${callCount}`);

  // 验证：updateActorForUser 函数体首行不是 ensureServiceRole()
  // 找到 updateActorForUser 函数声明位置
  const updateIdx = src.indexOf("export async function updateActorForUser");
  assert.ok(updateIdx >= 0, "updateActorForUser must exist");
  // 取函数声明后 200 字符（覆盖函数签名 + 前几行 body）
  const updateSlice = src.slice(updateIdx, updateIdx + 400);
  // 必须调用 getActorForUser
  assert.match(updateSlice, /getActorForUser\(userId, actorId\)/, "updateActorForUser must call getActorForUser");
  // body 首行不应是 ensureServiceRole()（应是注释或直接 getActorForUser）
  // 取 `) {` 后的第一行
  const bodyMatch = updateSlice.match(/\)\s*\{\s*\n([^\n]*)/);
  assert.ok(bodyMatch, "updateActorForUser body must exist");
  // 去除注释后检查代码部分
  const firstBodyLine = bodyMatch[1].split("//")[0];
  assert.doesNotMatch(firstBodyLine, /ensureServiceRole\(\)/, "updateActorForUser 首行不得调用 ensureServiceRole()");

  // 同理验证 archiveActorForUser
  const archiveIdx = src.indexOf("export async function archiveActorForUser");
  const archiveSlice = src.slice(archiveIdx, archiveIdx + 400);
  assert.match(archiveSlice, /getActorForUser\(userId, actorId\)/);
  const archiveBody = archiveSlice.match(/\)\s*\{\s*\n([^\n]*)/);
  assert.ok(archiveBody);
  assert.doesNotMatch(archiveBody[1].split("//")[0], /ensureServiceRole\(\)/, "archiveActorForUser 首行不得调用 ensureServiceRole()");

  // 同理验证 saveGeneratedActorImage
  const saveIdx = src.indexOf("export async function saveGeneratedActorImage");
  const saveSlice = src.slice(saveIdx, saveIdx + 600);
  assert.match(saveSlice, /getActorForUser\(params\.userId, params\.actorId\)/);
  // 找到 `) {` 后的首行（注意 saveGeneratedActorImage 有多行类型声明）
  const saveBody = saveSlice.match(/\}\)\s*\{\s*\n([^\n]*)/);
  assert.ok(saveBody, "saveGeneratedActorImage body must exist");
  assert.doesNotMatch(saveBody[1].split("//")[0], /ensureServiceRole\(\)/, "saveGeneratedActorImage 首行不得调用 ensureServiceRole()");

  // 同理验证 upsertAppearanceVariant
  const upsertIdx = src.indexOf("export async function upsertAppearanceVariant");
  const upsertSlice = src.slice(upsertIdx, upsertIdx + 600);
  assert.match(upsertSlice, /getActorForUser\(userId, input\.actor_id\)/);
  const upsertBody = upsertSlice.match(/\)\s*\{\s*\n([^\n]*)/);
  assert.ok(upsertBody);
  assert.doesNotMatch(upsertBody[1].split("//")[0], /ensureServiceRole\(\)/, "upsertAppearanceVariant 首行不得调用 ensureServiceRole()");
});

// === 6. actors.ts: getActorForUser 保留 ensureServiceRole() 作为单一校验入口 ===
test("actors.ts: getActorForUser 保留 ensureServiceRole() 作为单一校验入口", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("export async function getActorForUser");
  assert.ok(idx >= 0);
  const slice = src.slice(idx, idx + 300);
  // body 首行必须是 ensureServiceRole()
  const bodyMatch = slice.match(/\)\s*\{\s*\n([^\n]*)/);
  assert.ok(bodyMatch, "getActorForUser body must exist");
  assert.match(bodyMatch[1], /ensureServiceRole\(\)/, "getActorForUser 首行必须调用 ensureServiceRole()");
});

// === 7. 错误响应保留真实错误码 ===
test("apiError: 保留 PGRST204/42703/42P01/PGRST205 真实 schema 错误码", async () => {
  const src = await read("../lib/api/responses.ts");
  assert.match(src, /PGRST204/);
  assert.match(src, /42703/);
  assert.match(src, /42P01/);
  assert.match(src, /PGRST205/);
  assert.match(src, /unknownColumn && serviceError\s*\?\s*500/);
  assert.match(src, /数据库 schema 缺失列或表/);
});

// === 8. 三种用户场景的代码路径存在性（actors.ts）===
// Commit 4 更新：无团队路径不再退化为 ownerTop，而是 or=(visibility.eq.platform,owner_id.eq.X)
// 原因：platform 共享演员对所有 authenticated 用户可见，无团队用户也需看到平台共享演员。
test("actors.ts: 三种用户场景代码路径覆盖：无团队 / 单团队 / 多团队", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // 有团队路径：or() 拼接（platform + team + owner）
  assert.match(src, /teamExpr\s*\?\s*`or=\(visibility\.eq\.platform/, "有团队路径：or() 含 platform 首项");
  // 无团队路径：or=(visibility.eq.platform,owner_id.eq.X)
  assert.match(src, /:\s*`or=\(visibility\.eq\.platform,\$\{ownerInOr\}\)`/, "无团队路径：or=(platform,owner)");
  // 多团队路径：join(",") 支持 N 个 team_id
  assert.match(src, /teamIds\.map\(encodeURIComponent\)\.join\(","\)/, "多团队路径：join(,) 支持多个 team_id");
  // filter(Boolean) 确保 teamId 为空字符串/null 时被过滤
  assert.match(src, /\.filter\(Boolean\)/, "teamIds 必须 filter(Boolean) 去除空值");
});

// === 9. portrayals/route.ts: 三种用户场景同样覆盖 ===
test("portrayals/route.ts: 三种用户场景代码路径覆盖", async () => {
  const src = await read("../app/api/actors/portrayals/route.ts");
  assert.match(src, /accessQuery\s*=\s*teamExpr\s*\?\s*`or=\(/);
  assert.match(src, /:\s*ownerTop/);
  assert.match(src, /teamIds\.map\(encodeURIComponent\)\.join\(","\)/);
  assert.match(src, /\.filter\(Boolean\)/);
});

// === 10. portrayals/counts/route.ts: 三种用户场景同样覆盖 ===
test("portrayals/counts/route.ts: 三种用户场景代码路径覆盖", async () => {
  const src = await read("../app/api/actors/portrayals/counts/route.ts");
  assert.match(src, /accessFilter\s*=\s*teamExpr\s*\?\s*`or=\(/);
  assert.match(src, /:\s*ownerTop/);
  assert.match(src, /teamIds\.map\(encodeURIComponent\)\.join\(","\)/);
  assert.match(src, /\.filter\(Boolean\)/);
});

// === 11. 全量扫描：所有受影响文件不再有旧语法 ===
test("全量扫描：or()/and() 上下文不再有 owner_id=eq. / team_id=in. / and=( 旧语法", async () => {
  const files = [
    "../lib/supabase/actors.ts",
    "../app/api/actors/portrayals/route.ts",
    "../app/api/actors/portrayals/counts/route.ts",
    "../app/api/actors/[actorId]/route.ts",
  ];
  for (const f of files) {
    const src = await read(f);
    assert.doesNotMatch(src, /and=\(/, `${f}: 不得使用 and=( 旧语法`);
    assert.doesNotMatch(src, /team_id=in\./, `${f}: 不得使用 team_id=in. 旧语法`);
    assert.doesNotMatch(src, /or=\([^)]*owner_id=eq\./, `${f}: or() 内部不得使用 owner_id=eq. 旧语法`);
  }
});
