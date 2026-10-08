# 美术工作台升级 Task 1 后端报告

## 状态与范围

Task 1 后端实现完成；使用现有 private `art-assets` Storage 保存 JSON，无数据库迁移。未创建 clone/worktree，未 commit/push。未编辑 UI、`lib/art-workbench.ts` 或 chat route；共享工作区中其他代理的修改保留。

本任务文件：

- `lib/art/cloud-store.ts`
- `app/api/art/draft/route.ts`
- `app/api/art/jobs/[jobId]/route.ts`
- `app/api/art/download/route.ts`
- `app/api/art/models/route.ts`
- `app/api/art/generate-image/route.ts`
- `tests/art-cloud-store.test.mjs`
- 本报告 `docs/superpowers/plans/2026-10-08-art-backend-report.md`

## Route 可直接调用的接口

```ts
type ArtCloudScope =
  | { projectId: string; workId: string; draftId?: never }
  | { draftId: string; projectId?: never; workId?: never };

resolveArtCloudScope(userId: string, scope: unknown): string;
readArtCloudDraft(userId: string, scope: ArtCloudScope): Promise<ArtCloudDraft | null>;
writeArtCloudDraft(userId: string, scope: ArtCloudScope, draft: unknown): Promise<ArtCloudDraft>;
readArtCloudJob(userId: string, scope: ArtCloudScope, jobId: string): Promise<ArtCloudJob | null>;
writeArtCloudJob(userId: string, scope: ArtCloudScope, job: ArtCloudJob,
  options?: { createOnly?: boolean }): Promise<boolean>;
```

`userId` 必须来自 `authenticateRequest`，不信任请求中的用户字段。resolver 返回 Storage 目录 `<userId>/workbench/<encoded-scope>`，encoded-scope 为类型标记和 scope IDs 的 JSON tuple 经 base64url 编码；Work 与独立 draft 不共用目录。各 ID 非空、最多 128 字符，拒绝路径分隔符、百分号、控制字符与 `..`。

草稿存 `draft.json`，包含 `state` 对象、`messages` 数组和 `jobs` 数组，保留前端定义的其他字段；JSON 上限 1 MiB，messages 最多 500 条、jobs 最多 200 条。PUT 是完整草稿替换，不合并旧缓存。格式错误 400、超限 413；读取真正不存在才返回 null，网络、权限及损坏 JSON 报错，不能当成不存在。

任务存 `jobs/<jobId>.json`。`writeArtCloudJob` 默认 upsert；`createOnly: true` 使用 Storage `x-upsert: false`，已存在返回 false，其他存储错误抛出。后端任务字段为 `jobId`、`status`、`createdAt`、`updatedAt`、`expiresAt`、`images`、`prompt?`、`error`；不包含前端的 `id/assetId/variantId`，查询恢复时保留本地任务的关联字段。

另导出 `artCloudScopeFromQuery`、`refreshArtCloudJobImages`、`assertArtCloudImagePath`、`downloadArtCloudImage`、`artCloudErrorStatus` 和 `ART_JOB_TIMEOUT_MS`。读取任务的原始函数不重签图片；jobs GET 和生成结果重放会调用 refresh helper 重签 `previewUrl`。

## HTTP 接口与接入差异

- draft GET：`?projectId=...&workId=...` 或 `?draftId=...`，返回 `{success:true,draft}`；不存在为 `draft:null`。
- draft PUT：`{...scope,draft}`，返回 `{success:true,draft}`。scope 字段位于顶层。
- jobs GET：`/api/art/jobs/<jobId>` 使用同样的顶层 query scope 参数，返回 `{success:true,job}`；不存在为 `job:null`。读取时发现 running 已过期，会写入 failed 和 `error:"ART_JOB_EXPIRED"`。
- generate-image：请求使用嵌套 `scope`，推荐由前端先创建并保存 `jobId`。只有 scope 时服务端生成 UUID；只有 jobId、没有 scope 返回 400。不带二者的旧调用保持同步生成，`jobId:null`，无任务恢复与防重付费保证。缺省画幅统一 9:16，显式合法画幅保留。
- 带 scope 的生成图片写入同一 scope 的 `generated/<assetId>/...`，不信任顶层 projectId 作为任务图片目录。不会写入草稿或覆盖已锁定的资产母版。
- 新任务先持久化 running，再调用图片服务；Storage 仅创建竞争保证并发的同 scope/jobId 只有一个请求进入生成。相同 ID 无论请求内容是否变化都读取原任务，不再收费。
- completed 的 POST/重放返回 HTTP 200，包含 `jobId/status/job/images/imageUrl/provider/model/prompt/error`；running 重放 HTTP 202，`success:true,status:"running",images:[]`；failed 重放 HTTP 502，`success:false,status:"failed"`。第一次生成失败返回错误及 jobId，错误状态持久化后可 GET 查询。前端须识别 202，不应把无图片的 running 响应直接认定为失败。
- running TTL 330 秒，为现有 `maxDuration=300` 留出 30 秒余量。过期只在查询/重放时标记 failed，不自动重新生成。仍是同步最长 300 秒的服务端请求，不具备独立后台 worker；中断后只能恢复已持久化结果或最终失败状态。若状态写入失败，保留原 ID 查询；不可自动创建新 ID 重试付费。
- `referencePaths` 支持最多 14 个本人 PNG/JPEG/WebP Storage 路径，并重新签名。保留 `referenceUrls` 字段兼容本人同 Supabase origin 的 private signed/authenticated 图片 URL，提取路径后校验并重签；拒绝外部 URL、其他用户路径、编码绕过和路径穿越。模型自身更低的参考数量限制继续由目录及前端使用；提供商保持原有能力检查。
- download POST：`{storagePath,name?}`，直接读取本人 Storage 原图字节，返回 attachment；支持中文文件名，清理换行与引号。禁止 JSON、HTML、其他用户路径及路径绕过；原图不存在 404。
- models GET：仅按 `BFL_API_KEY` / `ATLASCLOUD_API_KEY` 是否配置及 `isAtlasAuthorizedUser` 过滤，返回 `{success:true,models}`。无参数返回所有有配置且有权限的目录项，保留 capabilities/maxReferences；`?hasReferences=true` 只保留 image-edit，`false` 只保留 text-to-image。不返回凭证值，不探测实际生成可用性。

## TDD 与验证

- 第一轮 RED：`node --test tests/art-cloud-store.test.mjs`，11 项中 10 项按预期失败，旧生成兼容测试通过。
- 边界补充 RED：17 项中 3 项失败，复现默认目录漏掉 edit 模型、JSON null 错误状态及缺图状态；随后修正转绿。空 scope 追加复现 200/400 差异、旧资产请求显式画幅复现错误尺寸，均修正转绿。
- 当前 GREEN：Task 1 行为测试 21/21，通过真实 route/helper 与 Storage、认证、图片服务的网络替身，未调用真实付费服务。覆盖 owner/scope、草稿读写与限制、损坏 JSON、原图字节与下载安全、参考图重签、任务完成/失败/过期恢复、同时首次创建竞争、Storage HTTP 400 Duplicate 格式及旧资产请求画幅兼容。
- 相关回归：`node --test tests/art-cloud-store.test.mjs tests/art-atlas-payload.test.mjs tests/art-provider-routing.test.mjs tests/art-sign-assets-route.test.mjs tests/art-domain.test.mjs tests/art-actions.test.mjs`，60/60 通过。
- 扩展共享工作区检查：`node --test tests/art-*.test.mjs`，93 项中 89 通过、4 失败；失败来自主代理负责的 UI 源码断言（`art-asset-scope` 的资产链接、`art-workbench-layout` 的旧 assistant rail、`art-workbench-new-project-scope` 的新建作用域与详情 draftId 链接）。本任务未编辑这些 UI 或测试；由主代理按最终 UI 更新断言并重新验证，不能据本报告宣称全套测试通过。
- `./node_modules/.bin/tsc --noEmit --incremental false` 最新运行退出 0。首次运行发现本任务 query scope 类型断言错误，已修正；当时共享 UI 的类型错误随后由主代理修正。
- `git diff --check` 通过。未做真实 Storage/付费模型验收、生产发布或后台 worker 验收；Task 4 的构建、登录浏览器及生产验收由主代理统一执行。
