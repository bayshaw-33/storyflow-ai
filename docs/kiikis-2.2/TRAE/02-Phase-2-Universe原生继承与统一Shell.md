# Phase 2：Universe 原生继承与统一 Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用测试驱动逐 Task 执行。只执行本阶段，完成后写 `handoffs/phase-2.md` 并停止。

**Goal:** 让每个 Work 成为 Universe 入口，并以对象级 Manifest、不可变 Snapshot 和 Local State 实现安全继承与显式升级。

**Architecture:** Universe Version 由结构化 Canon 内容的稳定 hash 决定。Work 绑定时保存 `InheritanceManifestV1 + Immutable Snapshot`；本地变化进入 Work Local State，Universe 更新只产生 Diff，用户逐项采用或提交 Change Proposal。

**Tech Stack:** TypeScript、Next.js API、Supabase/Postgres/RLS/RPC、现有 Canon/Proposal 服务、React Workbench Shell。

## Global Constraints

继承 [`README.md`](./README.md) 全部约束。Universe 继承不能退化为 Markdown 复制，不能用当前时间伪造版本号，不能自动覆盖 Work。

---

## 前置与分支

- 前置：Phase 1 Gate PASS；读取 `handoffs/phase-1.md`。
- 分支：`trae/K22-P2-universe-inheritance`。
- Migration：`supabase/migrations/20260828020000_K22-P2_universe_inheritance.sql`。
- 推荐提交：
  1. `test(v2.2): define universe inheritance contracts`
  2. `feat(v2.2): version universe canon by content hash`
  3. `feat(v2.2): add manifests snapshots and local state`
  4. `feat(v2.2): expose universe actions in every workbench`

## Task 2.1：Universe Version 与 Manifest 契约

**Files:**

- Create: `lib/contracts/v2/universe-inheritance-v22.ts`
- Create: `tests/contracts-v22/universe-inheritance.test.mjs`
- Modify: `lib/server/v2/universe/index.ts`
- Test: `tests/server-v2/universe-read/universe-read.test.mjs`

**Interfaces:**

```ts
export type WorkRelation = "canon_continuation" | "prequel" | "sequel" | "spinoff" | "adaptation" | "parallel";
export type CanonPolicy = "strict" | "flexible" | "reference_only";

export interface InheritanceManifestV1 {
  schemaVersion: "kiikis.inheritance-manifest/1";
  workId: string;
  universeId: string;
  universeVersionId: string;
  relation: WorkRelation;
  timelineAnchorId: string | null;
  canonPolicy: CanonPolicy;
  includedEntityVersionIds: string[];
  includedFactVersionIds: string[];
  includedRelationshipVersionIds: string[];
  includedTimelineEventVersionIds: string[];
  includedAssetVersionIds: string[];
  createdAt: string;
}
```

- [ ] **Step 1：写 RED**：相同 Canon 对象集合和版本顺序生成相同 contentHash；任一对象版本改变生成新 Universe Version；时间变化不影响 hash。
- [ ] **Step 2：实现稳定序列化**：按类型和稳定 ID 排序，排除 `updatedAt` 等非内容字段后计算 SHA-256。
- [ ] **Step 3：验证 Manifest parser**：拒绝跨 Universe 对象、重复 ID、缺 universeVersionId 和未知策略。

## Task 2.2：数据库地基与原子绑定

**Files:**

- Create: `supabase/migrations/20260828020000_K22-P2_universe_inheritance.sql`
- Create: `supabase/migrations/audits/audit_K22_P2_universe_inheritance.sql`
- Modify: `lib/server/v2/inheritance/index.ts`
- Modify: `lib/server/v2/inheritance/http.ts`
- Create: `app/api/v2/works/[workId]/universe/bind/route.ts`
- Create: `app/api/v2/works/[workId]/inheritance/route.ts`
- Test: `tests/server-v2/inheritance/inheritance-v22.test.mjs`

**Interfaces:** Produces `bindWorkToUniverse` and `readWorkInheritance`；兼容既有 project-level bind/snapshot API，但新工作台以 work-level API 为事实入口。

- [ ] **Step 1：写原子性 RED**

覆盖 standalone Work 首次绑定、从 Universe 创建时预绑定、重复绑定幂等、跨用户拒绝、对象不属于 Universe 拒绝、Manifest/Snapshot 任一失败全部回滚。

- [ ] **Step 2：实现表和约束**

新增：

- `storyflow_universe_versions`：universe_id、version_no、content_hash、object_index、created_by/at，append-only。
- `storyflow_work_inheritance_manifests`：work_id 唯一活动 Manifest，保存策略与 included IDs。
- `storyflow_work_inheritance_snapshots`：Manifest 对应的不可变对象快照与 hash。
- `storyflow_work_local_states`：work_id、base_manifest_id、entity_type/id、patch_json、revision、状态。

Snapshot 与 Universe Version 禁止 UPDATE/DELETE；Local State 通过 CAS 新 revision，不修改 Universe Entity 身份。

- [ ] **Step 3：实现窄 RPC**：`bind_work_to_universe_v22` 在同一事务校验 owner、冻结 Universe Version、创建 Manifest/Snapshot 并记录 Evidence Event。
- [ ] **Step 4：旧数据兼容**：存在 `storyflow_universe_project_links` 和 K2-C-03 snapshot 的项目继续可读；首次打开时生成 V2.2 Manifest，禁止后台批量猜测继承范围。
- [ ] **Step 5：RLS/audit GREEN**：无跨 owner 引用、无 Manifest 指向不同 Universe 对象、无 Snapshot hash 漂移。

## Task 2.3：Context Packet 服务

**Files:**

- Create: `lib/server/v2/context-packets/index.ts`
- Create: `lib/server/v2/context-packets/ranking.ts`
- Create: `app/api/v2/works/[workId]/context-packet/route.ts`
- Test: `tests/server-v2/context-packets/context-packets.test.mjs`

**Interfaces:**

```ts
export async function buildContextPacket(input: {
  ownerId: string;
  workId: string;
  workVersionId: string;
  view: string;
  selection?: { entityType: string; entityId: string } | null;
  tokenBudget: number;
}): Promise<{
  id: string;
  manifestId: string | null;
  references: Array<{ type: string; id: string; versionId: string; reason: string }>;
  content: unknown;
  contentHash: string;
}>;
```

- [ ] **Step 1：写预算和相关性 RED**：当前场角色/地点/关系优先，时间线邻近事件次之；无关 Universe 长文本不进入；固定输入得到固定引用顺序。
- [ ] **Step 2：实现高信号组包**：读取当前 Work Version、Manifest、Local State、最近用户选择和明确参考；不拼接全 Universe/全剧本/全会话。
- [ ] **Step 3：来源可见**：每个 reference 保存 reason 和 versionId，供剧本室“本次引用”展示和 Evidence 使用。

## Task 2.4：Universe 更新 Diff 与逐项采用

**Files:**

- Create: `lib/server/v2/inheritance/diff.ts`
- Create: `app/api/v2/works/[workId]/inheritance/diff/route.ts`
- Create: `app/api/v2/works/[workId]/inheritance/adopt/route.ts`
- Modify: `lib/server/v2/proposals/index.ts`
- Modify: `app/api/v2/universes/[universeId]/proposals/route.ts`
- Test: `tests/server-v2/inheritance/inheritance-diff.test.mjs`
- Test: `tests/server-v2/proposals/proposals.test.mjs`

- [ ] **Step 1：写 stale RED**：Universe 发布 U2 后，使用 U1 的 Work 只标记 stale；Work Version 和 Snapshot 内容不改变。
- [ ] **Step 2：实现对象级 Diff**：分类 added/changed/deprecated/conflict；Diff 引用 old/new versionId 和字段路径。
- [ ] **Step 3：逐项采用**：用户提交所选 Diff IDs，创建新 Manifest/Snapshot 和 Work Checkpoint；未选项保持旧版本。
- [ ] **Step 4：Work → Universe Proposal**：本地事实只能提交 draft/pending_review Proposal；接受后生成新 Universe Version 和 Evidence Event，拒绝不改变 Work。

## Task 2.5：所有工作台的 Universe 常驻动作

**Files:**

- Create: `components/v2/workbench-shell/UniverseStatus.tsx`
- Create: `components/v2/workbench-shell/UniverseBindingDialog.tsx`
- Modify: `components/v2/workbench-shell/TopBar.tsx`
- Modify: `components/v2/workbench-shell/WorkbenchShell.tsx`
- Modify: `lib/client/v2/universe/api.ts`
- Modify: `lib/client/v2/universe/types.ts`
- Modify: `components/v2/universe/UniverseWorkbenchClient.tsx`
- Test: `tests/ui-v2/workbench-shell/workbench-shell.test.mjs`
- Test: `tests/ui-v2/universe/universe.test.mjs`
- Create: `e2e/v22-universe-inheritance.spec.ts`

- [ ] **Step 1：写 UI RED**：standalone Work 显示“创建 Universe / 绑定已有 Universe”；bound Work 显示名称、真实版本、关系、stale 状态、“打开 / 查看继承 / 同步”。
- [ ] **Step 2：实现常驻组件**：七类 Work 都复用同一组件；不自动弹窗、不自动创建空 Universe。
- [ ] **Step 3：从 Universe 创建 Work**：Universe WorksPanel 选择 Work 类型和关系后调用 Phase 0 原子创建 + Task 2.2 绑定，进入工作台时 Manifest 已存在。
- [ ] **Step 4：浏览器 E2E**：覆盖 standalone→bind、Universe→new Work、U1→U2 stale、逐项采用、提交 Proposal。

## Phase 2 完整验证

```bash
node --test tests/contracts-v22/universe-inheritance.test.mjs tests/server-v2/inheritance/*.test.mjs tests/server-v2/context-packets/*.test.mjs tests/server-v2/proposals/proposals.test.mjs tests/server-v2/universe-read/universe-read.test.mjs tests/ui-v2/workbench-shell/workbench-shell.test.mjs tests/ui-v2/universe/*.test.mjs
npx playwright test e2e/v22-universe-inheritance.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## Gate 2

- Work 可以独立开始，也能随时创建/绑定/打开 Universe。
- Universe Version 来自稳定内容 hash，而非时间戳。
- Manifest、Snapshot、Local State 和 Context Packet 均有服务端事实源。
- Universe 更新不会改变已有 Work；逐项采用产生新版本。
- Work 回写 Universe 必须经过 Proposal 审核。
- 旧 project-level 绑定数据继续可读。

## 禁止扩展

- 不实现完整剧本室或外部文件导入。
- 不自动选择全部 Universe 对象。
- 不把 Local State 写回 Universe Entity。
- 不用前端 Markdown 摘要替代结构化 Snapshot。
