/**
 * actors-avatar-upload tests — KIIKIS-TR-ACTOR-P0-004 Commit 2
 *
 * 修复目标（验收 #3 #4 #6）：
 * - 废弃 Base64 (FileReader → data:image → JSON) 路径
 * - 客户端压缩到 ≤2048px / ≤6MB，自动旋转 + 去 EXIF
 * - 服务端上传到私有 art-assets Storage，DB 只存 storage_path
 * - 数据库禁止保存 data:image/... 字符串
 * - 原文件上限 20MB（客户端），服务端 6MB（压缩后）
 * - 更换头像产生新资产版本（路径含 timestamp+uuid，不覆盖历史文件）
 * - 上传失败不创建半成品演员
 *
 * 运行：node --test tests/actors-avatar-upload.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// === 1. lib/actors.ts: ActorProfileInput.avatar_asset_id 字段存在，uploaded_avatar_data_url 废弃 ===
test("lib/actors.ts: ActorProfileInput.avatar_asset_id 字段存在；uploaded_avatar_data_url 标记为 never", async () => {
  const src = await read("../lib/actors.ts");
  // 必须有 avatar_asset_id?: string | null （兼容 spread ActorProfile）
  assert.match(src, /avatar_asset_id\?:\s*string\s*\|\s*null/, "ActorProfileInput.avatar_asset_id 必须接受 string | null");
  // uploaded_avatar_data_url 标记为 never（编译期拒绝 Base64）
  assert.match(src, /uploaded_avatar_data_url\?:\s*never/, "uploaded_avatar_data_url 必须为 never");
  // 必须有 @deprecated 注释说明禁止保存 data:image
  // @deprecated 注释允许跨行（"仅 fallback" 与 "data:image" 在两行）
  assert.match(src, /@deprecated[\s\S]*?data:image/, "必须有 @deprecated 注释提及 data:image 禁令");
});

// === 2. lib/avatar-processing.ts: 客户端处理模块关键常量与函数 ===
test("lib/avatar-processing.ts: 20MB 原文件上限 + 2048px 最长边 + 6MB 目标 + 512px 降维下限", async () => {
  const src = await read("../lib/avatar-processing.ts");
  // 原文件 20MB
  assert.match(src, /MAX_RAW_SIZE\s*=\s*20\s*\*\s*1024\s*\*\s*1024/, "MAX_RAW_SIZE = 20MB");
  // 最长边 2048
  assert.match(src, /MAX_DIMENSION\s*=\s*2048/, "MAX_DIMENSION = 2048");
  // 目标 ≤ 6MB
  assert.match(src, /TARGET_MAX_SIZE\s*=\s*6\s*\*\s*1024\s*\*\s*1024/, "TARGET_MAX_SIZE = 6MB");
  // 降维下限 512
  assert.match(src, /MIN_DIMENSION\s*=\s*512/, "MIN_DIMENSION = 512");
  // 最低质量 0.3
  assert.match(src, /MIN_QUALITY\s*=\s*0\.3/, "MIN_QUALITY = 0.3");
  // 支持 JPEG/PNG/WebP
  assert.match(src, /\["image\/jpeg",\s*"image\/png",\s*"image\/webp"\]/, "ALLOWED_TYPES 必须是 JPEG/PNG/WebP");
  // createImageBitmap 自动旋转
  assert.match(src, /createImageBitmap\(file,\s*\{\s*imageOrientation:\s*"from-image"\s*\}\)/, "必须用 createImageBitmap from-image 自动旋转");
  // canvas 白底（避免 PNG 透明在 JPEG 变黑）
  assert.match(src, /ctx\.fillStyle\s*=\s*"#ffffff"/, "canvas 必须白底");
  // 输出 image/jpeg
  assert.match(src, /toBlob[\s\S]*?"image\/jpeg"/, "必须输出 image/jpeg");
});

// === 3. lib/avatar-processing.ts: 错误码 ===
test("lib/avatar-processing.ts: 暴露 4 个明确错误码", async () => {
  const src = await read("../lib/avatar-processing.ts");
  assert.match(src, /AVATAR_TYPE_UNSUPPORTED/, "必须有 AVATAR_TYPE_UNSUPPORTED");
  assert.match(src, /AVATAR_RAW_SIZE_EXCEEDS_20MB/, "必须有 AVATAR_RAW_SIZE_EXCEEDS_20MB");
  assert.match(src, /AVATAR_BITMAP_DECODE_FAILED/, "必须有 AVATAR_BITMAP_DECODE_FAILED");
  assert.match(src, /AVATAR_CANVAS_CONTEXT_FAILED|AVATAR_CANVAS_TO_BLOB_FAILED/, "必须有 canvas 失败错误码");
});

// === 4. lib/avatar-processing.ts: uploadProcessedAvatar 使用 FormData + Bearer token ===
test("lib/avatar-processing.ts: uploadProcessedAvatar 使用 FormData POST /api/actors/upload-avatar", async () => {
  const src = await read("../lib/avatar-processing.ts");
  // 必须用 FormData
  assert.match(src, /new FormData\(\)/, "必须用 FormData");
  // 必须用 Bearer token
  assert.match(src, /Authorization:\s*`Bearer \$\{token\}`/, "必须用 Bearer token");
  // 必须 POST /api/actors/upload-avatar
  assert.match(src, /fetch\(\s*"\/api\/actors\/upload-avatar"/, "必须 POST /api/actors/upload-avatar");
  // 必须返回 assetId / storagePath / previewUrl
  assert.match(src, /assetId:\s*string;\s*storagePath:\s*string;\s*previewUrl:\s*string/, "返回类型必须包含 assetId/storagePath/previewUrl");
});

// === 5. lib/supabase/actor-avatar-storage.ts: 服务端上传到私有 art-assets bucket ===
test("lib/supabase/actor-avatar-storage.ts: 服务端上传到 art-assets 私有 bucket", async () => {
  const src = await read("../lib/supabase/actor-avatar-storage.ts");
  // ART_BUCKET = "art-assets"
  assert.match(src, /ART_BUCKET\s*=\s*"art-assets"/, "ART_BUCKET 必须是 art-assets");
  // 6MB 压缩后上限
  assert.match(src, /MAX_UPLOAD_SIZE\s*=\s*6\s*\*\s*1024\s*\*\s*1024/, "MAX_UPLOAD_SIZE 必须是 6MB");
  // 路径规则：actor-avatars/{userId}/{timestamp}-{uuid}.{ext}
  assert.match(src, /actor-avatars\/\$\{input\.userId\}\/\$\{timestamp\}-\$\{uuid\}/, "路径必须含 timestamp+uuid 防覆盖");
  // x-upsert: false（不覆盖历史文件）
  assert.match(src, /"x-upsert":\s*"false"/, "x-upsert 必须是 false 防覆盖");
  // service role key 上传
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/, "必须用 service role key");
  // public_url: null（不存 Base64）
  assert.match(src, /public_url:\s*null/, "asset row 的 public_url 必须为 null");
  // asset_type 起始为 actor_avatar_upload
  assert.match(src, /asset_type:\s*"actor_avatar_upload"/, "初始 asset_type 必须是 actor_avatar_upload");
});

// === 6. lib/supabase/actor-avatar-storage.ts: 归属校验 + 绑定函数 ===
test("lib/supabase/actor-avatar-storage.ts: validateAvatarAssetBelongsToUser + attachAvatarAssetToActor", async () => {
  const src = await read("../lib/supabase/actor-avatar-storage.ts");
  // validateAvatarAssetBelongsToUser 必须校验 user_id + asset_type 前缀
  assert.match(src, /validateAvatarAssetBelongsToUser/, "函数必须存在");
  assert.match(src, /id=eq\.\$\{encodeURIComponent\(assetId\)\}&user_id=eq\.\$\{encodeURIComponent\(userId\)\}/, "必须按 user_id 校验归属");
  assert.match(src, /rows\[0\]\.asset_type\.startsWith\("actor_avatar"\)/, "必须校验 asset_type 前缀");
  // attachAvatarAssetToActor 把 asset_type 改为 actor_avatar
  assert.match(src, /attachAvatarAssetToActor/, "函数必须存在");
  assert.match(src, /asset_type:\s*"actor_avatar"/, "绑定后 asset_type 改为 actor_avatar");
});

// === 7. app/api/actors/upload-avatar/route.ts: POST 接收 FormData + 鉴权 ===
test("app/api/actors/upload-avatar/route.ts: POST 接收 FormData file=<Blob>", async () => {
  const src = await read("../app/api/actors/upload-avatar/route.ts");
  // runtime nodejs
  assert.match(src, /runtime\s*=\s*"nodejs"/, "runtime 必须是 nodejs");
  // 鉴权
  assert.match(src, /authenticateRequest\(request\)/, "必须 authenticateRequest");
  // hasServiceRoleConfig 校验
  assert.match(src, /hasServiceRoleConfig\(\)/, "必须 hasServiceRoleConfig 校验");
  // formData().get("file")
  assert.match(src, /formData\(\)/, "必须调 request.formData()");
  assert.match(src, /formData\.get\("file"\)/, "必须取 file 字段");
  // file instanceof File
  assert.match(src, /file instanceof File/, "必须校验 file instanceof File");
  // 返回 requestId
  assert.match(src, /requestId/, "响应必须含 requestId 便于排查");
});

// === 8. lib/supabase/actors.ts: createActorForUser 用 avatar_asset_id，禁用 Base64 ===
test("lib/supabase/actors.ts: createActorForUser 用 avatar_asset_id 校验+绑定，不再接 Base64", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // 必须导入 validateAvatarAssetBelongsToUser + attachAvatarAssetToActor
  // import 顺序无关：attachAvatarAssetToActor 可能在 validateAvatarAssetBelongsToUser 之前
  assert.match(src, /import\s*\{[^}]*validateAvatarAssetBelongsToUser[^}]*\}\s*from\s*"@\/lib\/supabase\/actor-avatar-storage"/, "必须导入 validateAvatarAssetBelongsToUser");
  assert.match(src, /import\s*\{[^}]*attachAvatarAssetToActor[^}]*\}\s*from\s*"@\/lib\/supabase\/actor-avatar-storage"/, "必须导入 attachAvatarAssetToActor");
  // createActorForUser 中校验 avatar_asset_id 归属
  assert.match(src, /validateAvatarAssetBelongsToUser\(userId,\s*input\.avatar_asset_id\)/, "createActorForUser 必须校验 avatar_asset_id 归属");
  // 校验失败抛 AVATAR_ASSET_INVALID
  assert.match(src, /throw new Error\("AVATAR_ASSET_INVALID"\)/, "校验失败必须抛 AVATAR_ASSET_INVALID");
  // 绑定资产到 actor
  assert.match(src, /attachAvatarAssetToActor\(input\.avatar_asset_id,\s*row\.id\)/, "必须调 attachAvatarAssetToActor 绑定");
  // 不再出现 uploaded_avatar_data_url 引用（除了类型 deprecation）
  // 数据库行 row.avatar_asset_id 初始 null，绑定后赋值
  assert.match(src, /row\.avatar_asset_id\s*=\s*input\.avatar_asset_id/, "row.avatar_asset_id 必须赋值");
  // status 在有头像时设为 ready
  assert.match(src, /row\.status\s*=\s*"ready"/, "有头像时 status 必须设为 ready");
});

test("lib/supabase/actors.ts: 私有 Storage 头像读取 storage_path 并重新签名", async () => {
  const src = await read("../lib/supabase/actors.ts");
  assert.match(src, /signActorAssetUrl/);
  assert.match(src, /select=id,public_url,storage_path,asset_type,metadata/);
  assert.match(src, /asset\.storage_path/);
  assert.match(src, /ACTOR_ASSET_SIGN_FAILED/);
  assert.match(src, /avatar_url: actor\.avatar_asset_id \? signedUrls\.get\(actor\.avatar_asset_id\)/);
});

// === 9. lib/supabase/actors.ts: updateActorForUser 用 avatar_asset_id ===
test("lib/supabase/actors.ts: updateActorForUser 用 avatar_asset_id 校验+绑定", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // updateActorForUser 也校验 avatar_asset_id 归属
  // 找到 updateActorForUser 函数体
  const idx = src.indexOf("export async function updateActorForUser");
  assert.ok(idx >= 0, "updateActorForUser must exist");
  const slice = src.slice(idx, idx + 3000);
  assert.match(slice, /validateAvatarAssetBelongsToUser\(userId,\s*input\.avatar_asset_id\)/, "updateActorForUser 必须校验 avatar_asset_id 归属");
  assert.match(slice, /patch\.avatar_asset_id\s*=\s*input\.avatar_asset_id/, "patch.avatar_asset_id 必须赋值");
});

// === 10. CreateActorModal.tsx: 移除 Base64 逻辑，改用 processAvatarImage + uploadProcessedAvatar ===
test("CreateActorModal.tsx: 移除 FileReader/Base64/1.5MB，改用 processAvatarImage + uploadProcessedAvatar", async () => {
  const src = await read("../components/actors/CreateActorModal.tsx");
  // 必须导入 processAvatarImage + uploadProcessedAvatar
  assert.match(src, /import\s*\{\s*processAvatarImage,\s*uploadProcessedAvatar\s*\}\s*from\s*"@\/lib\/avatar-processing"/, "必须导入两个函数");
  // 必须调 processAvatarImage
  assert.match(src, /processAvatarImage\(file\)/, "必须调 processAvatarImage");
  // 必须调 uploadProcessedAvatar
  assert.match(src, /uploadProcessedAvatar\(processed\.blob,\s*token\)/, "必须调 uploadProcessedAvatar");
  // 必须传 avatar_asset_id 给 API
  assert.match(src, /avatar_asset_id:\s*avatarAssetId\s*\|\|\s*undefined/, "POST body 必须传 avatar_asset_id");
  // 禁止 FileReader
  assert.doesNotMatch(src, /FileReader/, "不得使用 FileReader");
  // 禁止 readFileAsDataUrl
  assert.doesNotMatch(src, /readFileAsDataUrl/, "不得使用 readFileAsDataUrl");
  // 禁止 1.5 * 1024 * 1024 旧限制
  assert.doesNotMatch(src, /1\.5\s*\*\s*1024\s*\*\s*1024/, "不得保留 1.5MB 旧限制");
  // 禁止 uploaded_avatar_data_url 字段
  assert.doesNotMatch(src, /uploaded_avatar_data_url/, "不得再传 uploaded_avatar_data_url 字段");
  // accept 必须限定 jpeg/png/webp
  assert.match(src, /accept="image\/jpeg,image\/png,image\/webp"/, "accept 必须限定三种格式");
  // 处理/上传阶段 busy 状态
  assert.match(src, /avatarPhase/, "必须有 avatarPhase 状态");
});

// === 11. CreateActorModal.tsx: 错误映射覆盖 4 个错误码 ===
test("CreateActorModal.tsx: mapAvatarError 覆盖 4 个错误码", async () => {
  const src = await read("../components/actors/CreateActorModal.tsx");
  assert.match(src, /AVATAR_TYPE_UNSUPPORTED/, "必须映射 AVATAR_TYPE_UNSUPPORTED");
  assert.match(src, /AVATAR_RAW_SIZE_EXCEEDS_20MB/, "必须映射 AVATAR_RAW_SIZE_EXCEEDS_20MB");
  assert.match(src, /AVATAR_BITMAP_DECODE_FAILED/, "必须映射 AVATAR_BITMAP_DECODE_FAILED");
  assert.match(src, /AVATAR_UPLOAD/, "必须映射 AVATAR_UPLOAD*");
});

// === 12. actor-copy.ts: 新增 6 条文案（中英）覆盖处理/上传/错误 ===
test("actor-copy.ts: 中英文均包含 6 条新文案", async () => {
  const src = await read("../components/actors/actor-copy.ts");
  const keys = [
    "avatarProcessing",
    "avatarUploading",
    "avatarInProgress",
    "avatarErrorType",
    "avatarErrorSize",
    "avatarErrorDecode",
    "avatarErrorUpload",
  ];
  for (const key of keys) {
    // 中文和英文各出现一次（共 2 次）
    const matches = src.split(key).length - 1;
    assert.ok(matches >= 2, `${key} 必须在 zh 和 en 各出现一次，实际 ${matches}`);
  }
  // uploadLimit 文案更新（不再 1.5MB）
  assert.doesNotMatch(src, /1\.5MB/, "uploadLimit 不得保留 1.5MB 文案");
  assert.match(src, /20MB/, "uploadLimit 必须提及 20MB");
});

// === 13. 全量扫描：演员库代码不再有 Base64 残留 ===
test("全量扫描：演员库代码不再有 Base64 / FileReader / data:image 残留", async () => {
  const files = [
    "../lib/supabase/actors.ts",
    "../lib/supabase/actor-avatar-storage.ts",
    "../lib/actors.ts",
    "../lib/avatar-processing.ts",
    "../app/api/actors/upload-avatar/route.ts",
    "../app/api/actors/route.ts",
    "../components/actors/CreateActorModal.tsx",
  ];
  for (const f of files) {
    const src = await read(f);
    // 注释里允许出现 data:image 说明，但代码里不得使用
    // 移除注释后再检查
    const noComments = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(noComments, /new FileReader\(/, `${f}: 不得使用 new FileReader(`);
    assert.doesNotMatch(noComments, /readAsDataURL\(/, `${f}: 不得使用 readAsDataURL(`);
    // data:image 字符串不得作为字面量出现在代码中
    assert.doesNotMatch(noComments, /["'`]data:image\//, `${f}: 不得出现 data:image 字面量`);
  }
});

// === 14. 路径含 timestamp+uuid，不覆盖历史文件 ===
test("lib/supabase/actor-avatar-storage.ts: 路径含 timestamp+uuid，确保更换头像产生新资产版本", async () => {
  const src = await read("../lib/supabase/actor-avatar-storage.ts");
  // 必须有 timestamp = Date.now()
  assert.match(src, /timestamp\s*=\s*Date\.now\(\)/, "必须有 timestamp");
  // 必须有 uuid = crypto.randomUUID()
  assert.match(src, /uuid\s*=\s*crypto\.randomUUID\(\)/, "必须有 uuid");
  // 路径拼接
  assert.match(src, /`actor-avatars\/\$\{input\.userId\}\/\$\{timestamp\}-\$\{uuid\}\.\$\{extension\}`/, "路径必须含 timestamp+uuid+extension");
});

// === 15. 上传失败不创建半成品演员 ===
test("lib/supabase/actors.ts: createActorForUser 在 avatar 校验失败时抛错且不创建 actor", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // createActorForUser 中：avatar 校验失败必须抛 AVATAR_ASSET_INVALID
  // 校验在 serviceFetch POST 之前，确保不创建半成品
  const idx = src.indexOf("export async function createActorForUser");
  assert.ok(idx >= 0);
  const slice = src.slice(idx, idx + 2500);
  // AVATAR_ASSET_INVALID 必须在 serviceFetch("/rest/v1/storyflow_actor_profiles" 之前
  const avatarErrIdx = slice.indexOf("AVATAR_ASSET_INVALID");
  const postIdx = slice.indexOf('serviceFetch("/rest/v1/storyflow_actor_profiles"');
  assert.ok(avatarErrIdx >= 0 && postIdx >= 0 && avatarErrIdx < postIdx, "AVATAR_ASSET_INVALID 校验必须在 POST 之前");
});

// === 16. 旧 Base64 字段在 ActorProfileInput 标记为 never，编译期拒绝 ===
test("lib/actors.ts: createEmptyActorInput 在 Omit 中排除 avatar_asset_id、uploaded_avatar_data_url、origin_type、rights_confirmed", async () => {
  const src = await read("../lib/actors.ts");
  // createEmptyActorInput 的返回类型 Omit 必须排除两个字段
  assert.match(src, /Required<Omit<ActorProfileInput,\s*"avatar_asset_id"\s*\|\s*"uploaded_avatar_data_url"\s*\|\s*"origin_type"\s*\|\s*"rights_confirmed">>/, "Omit 必须排除 avatar_asset_id、uploaded_avatar_data_url、origin_type、rights_confirmed");
});
