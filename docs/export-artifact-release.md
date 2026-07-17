# ADR：导出 Artifact 发布链（KIIKIS-KM-G0-002C）

> 状态：已实现并测试（2026-07-17）｜Owner：Kimi｜回滚：见文末
> 交付物：`lib/release/` + `supabase/migrations/20260718010000_export_artifact_release.sql`
> + `tests/export-release.test.mjs`（11 用例）｜commit range：见 DEV_HANDOFF_LOG

## 1. 范围

实现并只实现：

```text
Provider / source file
→ private quarantine (export-quarantine 桶)
→ immutable artifact staging (export-artifacts 桶, 内容寻址)
→ final SHA-256 (服务端计算)
→ storage object version (final key = sha256)
→ atomic DB bind (storyflow_export_artifacts)
→ gated short-lived download (≤300s 签名 URL)
```

**不在本模块**：Export Request/Status/Download API 路由、UI、E2E、旧出口治理
（TRAE / KIIKIS-TR-G0-002）；Gate fail-open、客户端可信字段、RLS 终稿
（Codex / KIIKIS-CX-G0-001B）。本模块通过依赖注入与两者解耦。

## 2. 架构

```text
stage(input)        上传 export-quarantine:<owner>/staging/<uuid>-<hash12>
                    → INSERT row (status=staged)        ← 先存储后 DB
promote(id)         读 staging 字节 → 写 export-artifacts:<owner>/artifacts/<sha256>
                    → UPDATE final_key → 删 staging      ← 幂等
bind(input)         UPDATE status=released, bound_export_id
                    失败 → status=bind_failed (final 保留可重试)
release(input)      = promote + bind
rollback(id)        staged→删 staging；bind_failed→删 final；released→拒绝
signDownload(input) owner 校验 + authorize 钩子 + ≤300s 签名
sweepOrphans(owner) 超期 staging 对象删除；对象缺失的 staged 行 → cleaned
```

### 状态机

```text
staged ──promote──▶ staged(final_key 已填) ──bind──▶ released
staged ──rollback──▶ rolled_back
bind 失败 ──▶ bind_failed ──bind 重试──▶ released
bind_failed ──rollback──▶ rolled_back
staged(超期且对象缺失) ──sweep──▶ cleaned
```

`released` 为终态且不可变：修内容 = 新 idempotency key 发新 artifact。

## 3. 不变量

1. 先写对象存储，后写数据库；DB 失败 → 尽力删刚上传对象，残留由 sweeper 收敛。
2. final key 内容寻址：不可变、天然去重（同字节仅一份）、promote 幂等。
3. `sha256` 永远服务端计算；客户端 hash 仅可存 `metadata.client_sha256` 作参考。
4. `(owner_id, idempotency_key)` 唯一：重试/重放/双击返回同一 artifact。
5. 签名下载：`status=released` + `owner_id=requesterId` + `authorize` 钩子通过，
   TTL ≤ 300s；非 owner 与不存在返回同一错误码（不泄露存在性）。

## 4. 部分失败矩阵

| 失败点 | 结果 | 恢复 |
|---|---|---|
| stage 上传失败 | 无对象无行 | 同 key 重试 |
| stage 上传成功、INSERT 失败 | 孤儿 staging 对象 | sweeper 24h 收敛 |
| stage INSERT 冲突（并发同键） | 删本次上传，返回胜者行 | 天然幂等 |
| promote 上传失败 | staging 保留 | 重试 promote |
| promote 后 staging 删除失败 | 孤儿 staging | sweeper 收敛 |
| bind UPDATE 失败 | status=bind_failed，final 保留 | 重试 bind 或 rollback |
| rollback 删除对象失败 | 行已 rolled_back，对象残留 | sweeper / 人工 |
| sign 失败 | 无签发，无状态变更 | 重试 |

## 5. 给 TRAE 的调用契约（KIIKIS-TR-G0-002）

```ts
import { createRestClient, createStorageClient } from "@/lib/release/storage-rest";
import { stage, release, signDownload, rollback, sweepOrphans } from "@/lib/release/release";

// 组装（在 API 路由内）：fetch 用项目既有 serviceFetch 风格封装
const store = {
  storage: createStorageClient(`${SUPABASE_URL}/storage/v1`, serviceFetch),
  rest: createRestClient(`${SUPABASE_URL}/rest/v1`, serviceFetch),
};

// Export Request API 内（生成/标识完成后）：
const artifact = await stage({ ownerId: user.id, idempotencyKey, bytes, contentType, source: "render" }, store);
await release({ artifactId: artifact.id, ownerId: user.id, exportId, labelRecordId }, store);

// Download API 内（建议 authorize 钩子接 compliance run decision=allowed）：
const { url, expiresIn } = await signDownload({ artifactId, requesterId: user.id, authorize }, store);
```

错误码 → HTTP 建议：`ARTIFACT_NOT_FOUND` 404；`DOWNLOAD_FORBIDDEN` 403；
`DOWNLOAD_NOT_RELEASED` / `INVALID_STATE` / `ALREADY_BOUND` 409；`EMPTY_PAYLOAD` 400；
其余 500。错误类为 `ReleaseError`（`.code` 稳定）。

## 6. 给 Codex 的审查点（KIIKIS-CX-G0-001B 交接）

- 本模块 RLS 为 owner 维度初版（migration §4），终稿归 Codex。
- `authorize` 钩子是合规 Gate 的挂载点：默认只做 owner 校验，**生产接线时必须由
  API 层注入 compliance run 校验**（当前 Gate 的 fail-open 问题由 Codex 修复）。
- storage 桶为私有桶，anon/auth 默认无权限；所有操作经 service role。
- hash/manifest 相关信任边界：sha256 仅服务端计算（见不变量 3）。

## 7. Schema

见 `supabase/migrations/20260718010000_export_artifact_release.sql`：
两个私有桶（各 1GB 上限）+ `storyflow_export_artifacts`
（状态 CHECK、sha256 格式 CHECK、`UNIQUE(owner_id, idempotency_key)`、
updated_at 触发器、owner RLS）。全部幂等写法，可重复执行。

## 8. 测试

```bash
node tests/export-release.test.mjs   # 11 用例：happy/幂等/去重/冲突/部分失败/回滚/门控/清理
pnpm exec tsc --noEmit
```

## 9. 回滚

1. 代码：`git revert <commit range>`（本模块文件均为新增，无既有文件改动）。
2. 数据库（手动）：迁移文件头部注释的 DROP/DELETE 语句。
3. 运行时无 flag 依赖；未接线的 API 不会调用本模块，回滚不影响存量功能。

## 10. 已知边界

- sweeper 按 owner 维度触发（在任意该 owner 的请求链路里调用即可）；全局长任务
  版 sweeper 留给 Worker 主链（后续 Kimi 核心卡）。
- 大文件 promote 为内存内读写字节（≤50MB 导出场景足够）；分片上传留待视频大文件
  链路（Edit Bay Render Worker 任务卡）。
