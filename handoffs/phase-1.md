# Phase 1 Handoff：Work 身份、会话、版本与 Evidence 地基

> 分支：`feat/K22-P1-work-history`
> 基线：`origin/main` @ `c01e65bf`（Phase 0 合并后）
> 契约版本：`2.2.0-alpha.1`（兼容 `2.0.0-alpha.1`）
> 交付日期：2026-08-14

## Goal

把 Work 从入口身份扩展为可恢复会话、不可变版本、生成候选和可下载 Evidence 的统一事实源。Work Version、Conversation Message、Generation Request Snapshot 和 Candidate 全部服务端持久化；Checkpoint/Finalized 是不可变版本类型，不再等同于页面导航。EvidenceManifestV2 从这些事实源确定性构建。

## Gate 1 验收

| 验收项 | 状态 | 证据 |
|--------|------|------|
| 每个 Project 有真实 primary Work；每个 Work 有稳定版本链 | ✅ | `tests/server-v2/works/versions.test.mjs` + `tests/server-v2/works/state-machine.test.mjs` |
| Checkpoint/Finalized 与页面导航解耦，正式版本不可变 | ✅ | `lib/server/v2/works/versions.ts` — guard trigger 禁止 UPDATE/DELETE |
| 重开 Work 后完整恢复消息、候选和版本 | ✅ | `tests/server-v2/conversations/conversations.test.mjs` + `tests/server-v2/generations/generations.test.mjs` |
| 最新输入先落库，再进入 Generation Snapshot | ✅ | `lib/server/v2/generations/index.ts` — 先 appendMessage，再 createGenerationRequest |
| EvidenceManifestV2 可重复构建并校验 hash | ✅ | `tests/server-v2/evidence/manifest-v2.test.mjs` — 确定性测试 |
| 旧 V2 contract 和 Evidence 下载回归通过 | ✅ | `tests/evidence-download.test.mjs` + `tests/evidence-ledger.test.mjs` |

## 交付内容

### Task 1.1：冻结 V2.2 Work History 契约

**Commit:** `ef980632` — `test(v2.2): define work history contracts`

- `lib/contracts/v2/work-history.ts` — WorkVersionV22、ConversationMessageV22、GenerationRequestSnapshotV22、GenerationCandidateV22 类型与 parser
- `lib/contracts/v2/evidence-manifest-v2.ts` — EvidenceManifestV2 schema `kiikis.evidence-manifest/2`
- `tests/contracts-v22/work-history.test.mjs` — 契约验证（拒绝空 workId、非法 kind、缺 hash 等）
- `tests/contracts-v22/evidence-manifest.test.mjs` — Manifest 文件缺 sha256 拒绝

### Task 1.2：Work Version、Checkpoint 与 Finalized

**Commit:** `901d5e06` — `feat(v2.2): add immutable work versions`

- `supabase/migrations/20260828010000_K22-P1_work_history.sql` — `storyflow_work_versions` 表、guard trigger、RPC `append_work_version`、CAS 并发控制
- `lib/server/v2/works/versions.ts` — `appendWorkVersion`、`createCheckpoint`、`finalizeWorkVersion`、`listWorkVersions`
- `app/api/v2/works/[workId]/route.ts` — Work 详情
- `app/api/v2/works/[workId]/versions/route.ts` — 版本列表 / 追加
- `app/api/v2/works/[workId]/checkpoints/route.ts` — Checkpoint 创建
- `app/api/v2/works/[workId]/finalize/route.ts` — Finalize（不可逆）
- `tests/server-v2/works/versions.test.mjs` + `tests/server-v2/works/state-machine.test.mjs`

关键约束：
- Finalized 版本不可 UPDATE/DELETE（guard trigger）
- Finalized 后编辑创建 child Editing Draft（parentVersionId = finalized.id）
- 并发 CAS 冲突返回 409 + currentVersionId
- content hash 在服务端以稳定 JSON 计算

### Task 1.3：Conversation Ledger 与 Generation Snapshot

**Commit:** `7bc3feda` — `feat(v2.2): persist conversations and generation requests`

- `lib/server/v2/conversations/index.ts` — append-only 对话账本
- `lib/server/v2/generations/index.ts` — 生成快照 + 候选应用事务
- `app/api/v2/works/[workId]/conversations/route.ts` + `[threadId]/messages/route.ts`
- `app/api/v2/works/[workId]/generation-requests/route.ts`
- `app/api/v2/works/[workId]/candidates/[candidateId]/apply/route.ts`
- `lib/client/v2/work-history/api.ts` — 客户端 API 封装
- `tests/server-v2/conversations/conversations.test.mjs` + `tests/server-v2/generations/generations.test.mjs`

关键约束：
- 消息 append-only，客户端不能修改或删除
- "先保存输入，再生成"：generate/update 请求必须引用已持久化的 user message
- 候选应用在同一事务创建新版本 + 标记 candidate=applied；失败时两者都不改变
- 重放 idempotency key 不重复消息/候选/版本

### Task 1.4：EvidenceManifestV2 与统一下载 API

**Commit:** 本 handoff 提交 — `feat(v2.2): export evidence manifest v2`

- `lib/server/v2/evidence/manifest-v2.ts` — 确定性 manifest builder（从 Work 版本、对话、生成请求等事实源构建）
- `lib/server/v2/evidence/package-v2.ts` — 异步包生成 + 幂等（manifestHash 去重）+ 签名 URL
- `app/api/v2/works/[workId]/evidence/route.ts` — GET manifest / POST 生成包
- `app/api/v2/evidence/packages/[packageId]/download/route.ts` — 短期签名 URL 下载
- `supabase/migrations/20260828011000_K22-P1_evidence_packages_v22.sql` — `storyflow_evidence_packages_v22` 表 + RLS
- `tests/server-v2/evidence/manifest-v2.test.mjs` — 确定性测试（相同事实 → 相同 hash）
- `tests/evidence-download.test.mjs` — 包生成、幂等、签名 URL 测试

关键约束：
- Manifest schema `kiikis.evidence-manifest/2`，contract `2.2.0-alpha.1`
- 不把 secret、API key、Provider 临时 URL 写入包
- 相同事实集合生成相同 manifestHash（确定性排序）
- 包幂等：manifestHash 已存在则返回既有包
- 下载 URL owner-scoped + 短期签名

### Task 1.5：最小客户端历史恢复接线

**Commit:** 本 handoff 提交 — `feat(v2.2): export evidence manifest v2`

- `components/v2/workbench-shell/VersionActions.tsx` — Checkpoint / Finalize 操作（含不可逆确认）
- `components/v2/workbench-shell/EvidenceActions.tsx` — Evidence 包下载
- `components/v2/workbench-shell/WorkbenchShell.tsx` — 版本操作栏 + 无 workId 阻断错误
- `components/v2/workbench-shell/workbench-shell.module.css` — versionBar / blockingError 样式
- `lib/client/v2/workbench/types.ts` — WorkbenchAdapter 扩展（workId、版本指针、回调）
- `tests/ui-v2/workbench-shell/workbench-shell.test.mjs` — 14 测试（阻断、版本操作可用性）
- `e2e/v22-work-history.spec.ts` — 5 E2E（阻断横幅、版本栏、Finalize 确认、Evidence 下载）

关键约束：
- 无 workId 时显示阻断错误横幅（不本地假保存）
- Finalized 后 Checkpoint/Finalize 禁用，Evidence 仍可用
- Finalize 前弹出不可逆确认对话框
- Shell 只显示横向能力，不改专业工作台布局

## 测试与验证

### Node 测试（144 pass / 0 fail）

```bash
node --test \
  tests/contracts-v22/*.test.mjs \
  tests/server-v2/works/*.test.mjs \
  tests/server-v2/conversations/*.test.mjs \
  tests/server-v2/generations/*.test.mjs \
  tests/server-v2/evidence/*.test.mjs \
  tests/ui-v2/workbench-shell/workbench-shell.test.mjs \
  tests/evidence-download.test.mjs
# → tests 144, pass 144, fail 0
```

### TypeScript

```bash
npx tsc --noEmit
# → 0 errors
```

### Build

```bash
pnpm build
# → Compiled successfully, all routes generated
```

### E2E（Playwright）

已创建 `e2e/v22-work-history.spec.ts`（5 测试），需在 dev server / CI 中运行：
- 无 workId 阻断错误横幅
- 有 workId 版本操作栏
- Finalize 不可逆确认
- Evidence 下载可点击
- 阻断错误包含恢复指引

## 数据库迁移

| Migration | 内容 |
|-----------|------|
| `20260828010000_K22-P1_work_history.sql` | `storyflow_work_versions` 表、guard trigger、RPC、CAS、`storyflow_works` 指针扩展 |
| `20260828011000_K22-P1_evidence_packages_v22.sql` | `storyflow_evidence_packages_v22` 表 + RLS + 幂等索引 |

## API 路由总览

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/v2/works/[workId]` | GET | Work 详情 |
| `/api/v2/works/[workId]/versions` | GET/POST | 版本列表 / 追加 |
| `/api/v2/works/[workId]/checkpoints` | POST | 创建 Checkpoint |
| `/api/v2/works/[workId]/finalize` | POST | 定稿（不可逆） |
| `/api/v2/works/[workId]/conversations` | GET | 对话线程列表 |
| `/api/v2/works/[workId]/conversations/[threadId]/messages` | GET/POST | 消息列表 / 追加 |
| `/api/v2/works/[workId]/generation-requests` | POST | 创建生成请求 |
| `/api/v2/works/[workId]/candidates/[candidateId]/apply` | POST | 应用候选 |
| `/api/v2/works/[workId]/evidence` | GET/POST | Manifest / 生成包 |
| `/api/v2/evidence/packages/[packageId]/download` | GET | 签名 URL 下载 |

## 下一步

- 合并 `feat/K22-P1-work-history` 到 `main`
- Vercel 自动部署，验证 build 状态
- NAS 可用时 `git pull origin main` 同步
- 等待 Phase 2 PRD 确认：Universe 原生继承与统一 Shell
