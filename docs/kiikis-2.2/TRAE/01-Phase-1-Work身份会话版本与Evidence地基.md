# Phase 1：Work 身份、会话、版本与 Evidence 地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用测试驱动逐 Task 执行。只执行本阶段，完成后写 `handoffs/phase-1.md` 并停止。

**Goal:** 把 Work 从入口身份扩展为可恢复会话、不可变版本、生成候选和可下载 Evidence 的统一事实源。

**Architecture:** Work Version、Conversation Message、Generation Request Snapshot 和 Candidate 全部服务端持久化；Checkpoint/Finalized 是不可变版本类型，不再等同于页面导航。EvidenceManifestV2 从这些事实源确定性构建。

**Tech Stack:** TypeScript contracts、Next.js API routes、Supabase/Postgres/RLS/RPC、JSZip、Node test runner。

## Global Constraints

继承 [`README.md`](./README.md) 全部约束。禁止把 `storyflow_projects.data`、localStorage 或扁平 notes 继续当作会话与版本事实源。

---

## 前置与分支

- 前置：Phase 0 Gate PASS；读取 `handoffs/phase-0.md`。
- 分支：`trae/K22-P1-work-history`。
- Migration：`supabase/migrations/20260828010000_K22-P1_work_history.sql`。
- 推荐提交：
  1. `test(v2.2): define work history contracts`
  2. `feat(v2.2): add immutable work versions`
  3. `feat(v2.2): persist conversations and generation requests`
  4. `feat(v2.2): export evidence manifest v2`

## Task 1.1：冻结 V2.2 Work History 契约

**Files:**

- Create: `lib/contracts/v2/work-history.ts`
- Create: `lib/contracts/v2/evidence-manifest-v2.ts`
- Modify: `lib/contracts/v2/index.ts`
- Test: `tests/contracts-v22/work-history.test.mjs`
- Test: `tests/contracts-v22/evidence-manifest.test.mjs`

**Interfaces:**

```ts
export const KIIKIS_22_CONTRACT_VERSION = "2.2.0-alpha.1" as const;
export type WorkVersionKind = "editing_draft" | "checkpoint" | "finalized";
export type ConversationRole = "user" | "assistant" | "system";
export type CandidateStatus = "ready" | "applied" | "rejected" | "superseded";

export interface WorkVersionV22 {
  id: string;
  workId: string;
  parentVersionId: string | null;
  kind: WorkVersionKind;
  contentSchema: string;
  content: unknown;
  contentHash: string;
  source: "manual" | "ai" | "import" | "restore";
  sourceMessageIds: string[];
  sourceJobId: string | null;
  createdAt: string;
}
```

- [ ] **Step 1：写 parser RED**：拒绝空 workId、非法 kind、缺 hash、Finalized 缺来源、Manifest 文件缺 sha256；确认旧 `CONTRACT_VERSION` 仍为 `2.0.0-alpha.1`。
- [ ] **Step 2：实现纯 TypeScript parser/type guard**：V2.2 常量独立导出，禁止改写旧常量。
- [ ] **Step 3：GREEN**：`node --test tests/contracts-v22/*.test.mjs`。

## Task 1.2：Work Version、Checkpoint 与 Finalized

**Files:**

- Create: `supabase/migrations/20260828010000_K22-P1_work_history.sql`
- Create: `supabase/migrations/audits/audit_K22_P1_work_history.sql`
- Create: `lib/server/v2/works/versions.ts`
- Create: `app/api/v2/works/[workId]/route.ts`
- Create: `app/api/v2/works/[workId]/versions/route.ts`
- Create: `app/api/v2/works/[workId]/checkpoints/route.ts`
- Create: `app/api/v2/works/[workId]/finalize/route.ts`
- Test: `tests/server-v2/works/versions.test.mjs`
- Test: `tests/server-v2/works/state-machine.test.mjs`

**Interfaces:**

- Produces `appendWorkVersion(input)`、`createCheckpoint(input)`、`finalizeWorkVersion(input)`、`listWorkVersions(input)`。
- Phase 2 Manifest 引用稳定 `workVersionId/contentHash`；Phase 3 剧本室只通过这些接口创建版本。

- [ ] **Step 1：写状态机 RED**

覆盖：首个 Editing Draft、父版本链、相同 idempotency key 幂等、Checkpoint 不改变历史、Finalized 不可更新/删除、Finalized 后编辑创建 child Editing Draft、并发 parent CAS 冲突返回 409。

```js
assert.equal(finalized.kind, "finalized");
await assert.rejects(() => updateVersion(finalized.id), /immutable/i);
assert.equal(child.parentVersionId, finalized.id);
assert.equal(child.kind, "editing_draft");
```

- [ ] **Step 2：实现 migration**

新增 `storyflow_work_versions`，包含 parent、kind、content_schema/content_json/content_hash、source、source_message_ids、source_job_id、idempotency_key、created_by/at。给 `storyflow_works` 增加 `current_version_id`、`latest_checkpoint_id`、`finalized_version_id`。用 guard trigger 禁止版本 UPDATE/DELETE；用 RPC 原子追加版本并 CAS 更新指针。

- [ ] **Step 3：实现服务端和 API**

所有 content hash 在服务端以稳定 JSON 计算。客户端不得指定 `createdBy`、不得直接把任意历史 ID 设为 finalized；Finalize 只能引用同一 Work 的现有 Checkpoint 或 Editing Draft。

- [ ] **Step 4：RLS/并发 GREEN**

验证 owner 可读写、其他用户/匿名不可读、service role 可执行后台任务；两个客户端基于同一 parent 并发写时一个成功、一个 409 并返回 currentVersionId。

## Task 1.3：Conversation Ledger 与 Generation Snapshot

**Files:**

- Create: `lib/server/v2/conversations/index.ts`
- Create: `lib/server/v2/generations/index.ts`
- Create: `app/api/v2/works/[workId]/conversations/route.ts`
- Create: `app/api/v2/works/[workId]/conversations/[threadId]/messages/route.ts`
- Create: `app/api/v2/works/[workId]/generation-requests/route.ts`
- Create: `app/api/v2/works/[workId]/candidates/[candidateId]/apply/route.ts`
- Create: `lib/client/v2/work-history/api.ts`
- Test: `tests/server-v2/conversations/conversations.test.mjs`
- Test: `tests/server-v2/generations/generations.test.mjs`

**Interfaces:**

```ts
export async function appendConversationMessage(input: {
  ownerId: string;
  workId: string;
  threadId: string;
  role: ConversationRole;
  content: string;
  idempotencyKey: string;
}): Promise<ConversationMessageV22>;

export async function createGenerationRequest(input: {
  ownerId: string;
  workId: string;
  baseVersionId: string;
  messageIds: string[];
  contextPacketId?: string | null;
  operation: "discuss" | "propose_change" | "generate" | "update";
}): Promise<GenerationRequestSnapshotV22>;
```

- [ ] **Step 1：写会话恢复 RED**：100 条 user/assistant 消息重开后顺序、角色、时间和 ID 一致；分页无丢失/重复；客户端不能修改或删除消息。
- [ ] **Step 2：扩展 Phase 1 migration**：新增 thread、message、generation_request_snapshot、generation_candidate 表；消息和请求快照 append-only；候选只允许原子 `ready → applied/rejected/superseded`。
- [ ] **Step 3：实现“先保存输入，再生成”事务边界**：`generate/update` 请求必须引用已持久化的当前 user message；空输入时引用明确的既有消息集合，不能依赖 React 异步 state。
- [ ] **Step 4：候选应用**：应用候选创建新的 Work Version，并在同一事务把 candidate 标为 applied；失败时两者都不改变。
- [ ] **Step 5：GREEN**：验证重放 idempotency key 不重复消息/候选/版本。

## Task 1.4：EvidenceManifestV2 与统一下载 API

**Files:**

- Create: `lib/server/v2/evidence/manifest-v2.ts`
- Create: `lib/server/v2/evidence/package-v2.ts`
- Create: `app/api/v2/works/[workId]/evidence/route.ts`
- Create: `app/api/v2/evidence/packages/[packageId]/download/route.ts`
- Modify: `lib/evidence/package.ts`
- Modify: `lib/evidence/download.ts`
- Test: `tests/server-v2/evidence/manifest-v2.test.mjs`
- Test: `tests/evidence-download.test.mjs`

**Interfaces:** Produces PRD `EvidenceManifestV2`，供所有后续工作台直接调用；文件下载 URL 必须短期签名且 owner-scoped。

- [ ] **Step 1：写确定性 RED**：相同事实集合生成相同 manifest 内容和 file hashes；不同消息/版本改变 hash；文件顺序不影响结果。
- [ ] **Step 2：实现 manifest builder**：聚合 Work、Version、Conversation、Generation、Job、Asset、Universe、Rights 和 Evidence Event ID；不把 secret、API key、Provider 临时 URL 写入包。
- [ ] **Step 3：实现异步包 Job**：大包返回 `202 + jobId`；完成后写持久对象存储和 `storyflow_evidence_packages`，重复请求按 source hash 幂等。
- [ ] **Step 4：兼容旧 evidence package**：旧下载路由继续可用；V2.2 新包使用 schema `kiikis.evidence-manifest/2`。

## Task 1.5：最小客户端历史恢复接线

**Files:**

- Modify: `components/v2/workbench-shell/TopBar.tsx`
- Modify: `components/v2/workbench-shell/TaskBar.tsx`
- Create: `components/v2/workbench-shell/VersionActions.tsx`
- Create: `components/v2/workbench-shell/EvidenceActions.tsx`
- Modify: `components/v2/workbench-shell/WorkbenchShell.tsx`
- Test: `tests/ui-v2/workbench-shell/workbench-shell.test.mjs`
- Create: `e2e/v22-work-history.spec.ts`

- [ ] **Step 1：写 RED**：任何 Work Shell 都显示保存状态、版本、Checkpoint、Finalized、留痕下载；无 workId 时显示阻断错误而非本地假保存。
- [ ] **Step 2：接入 API**：Shell 只显示横向能力，不改专业工作台布局；点击 Finalized 前明确版本和影响。
- [ ] **Step 3：重开验证**：创建消息、候选、Checkpoint，刷新/退出重开后全部恢复并可下载 Evidence。

## Phase 1 完整验证

```bash
node --test tests/contracts-v22/*.test.mjs tests/server-v2/works/*.test.mjs tests/server-v2/conversations/*.test.mjs tests/server-v2/generations/*.test.mjs tests/server-v2/evidence/*.test.mjs tests/ui-v2/workbench-shell/workbench-shell.test.mjs tests/evidence-download.test.mjs
npx playwright test e2e/v22-work-history.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## Gate 1

- 每个 Project 有真实 primary Work；每个 Work 有稳定版本链。
- Checkpoint/Finalized 与页面导航解耦，正式版本不可变。
- 重开 Work 后完整恢复消息、候选和版本。
- 最新输入先落库，再进入 Generation Snapshot。
- EvidenceManifestV2 可重复构建并校验 hash。
- 旧 V2 contract 和 Evidence 下载回归通过。

## 禁止扩展

- 不在本阶段实现 Universe 继承或剧本室 UI。
- 不把历史 `storyflow_versions` 批量破坏性迁移；只做读取兼容或按需映射。
- 不在客户端直接写 conversation/version/evidence 表。
- 不允许 Finalized 通过“取消定稿”后原地覆盖。
