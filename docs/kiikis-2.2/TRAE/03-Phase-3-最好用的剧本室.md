# Phase 3：最好用的剧本室 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用测试驱动逐 Task 执行。只执行本阶段，完成后写 `handoffs/phase-3.md` 并停止。

**Goal:** 把高频剧本创作升级为可自由导航、持续对话、局部改写、版本安全、Universe 可见的“AI 剧本室”。

**Architecture:** 新剧本室使用三栏布局和结构化 Screenplay Document。导航状态、内容状态和正式版本状态分离；AI“聊一聊”只追加消息，“生成修改方案”创建可审阅 Candidate Diff，用户选择性应用后产生新 Work Version。

**Tech Stack:** React 19、WorkbenchShell、Phase 1 Work History、Phase 2 Context Packet/Inheritance、Supabase/Postgres、Node tests、Playwright。

## Global Constraints

继承 [`README.md`](./README.md) 全部约束。剧本是 V2.2 第一优先；不得保留“必须先定稿上一步才能进入下一步”的导航门禁，不得继续提供小说模式。

---

## 前置与分支

- 前置：Phase 2 Gate PASS；读取 `handoffs/phase-2.md`。
- 分支：`trae/K22-P3-screenplay-studio`。
- Migration：`supabase/migrations/20260828030000_K22-P3_screenplay_units.sql`。
- 推荐提交：
  1. `test(v2.2): define screenplay studio behavior`
  2. `feat(v2.2): add screenplay units and dependency state`
  3. `feat(v2.2): build free-navigation screenplay studio`
  4. `feat(v2.2): add kk discussion and candidate diffs`
  5. `feat(v2.2): add screenplay continuity tools`

## Task 3.1：Screenplay Document 与 Unit 契约

**Files:**

- Create: `lib/contracts/v2/screenplay-studio.ts`
- Create: `lib/server/v2/screenplays/document.ts`
- Create: `tests/contracts-v22/screenplay-studio.test.mjs`
- Test: `tests/server-v2/screenplays/document.test.mjs`

**Interfaces:**

```ts
export type ScreenplayUnitType = "world" | "character" | "outline" | "episode" | "scene";
export type UnitReadiness = "empty" | "draft" | "checkpoint" | "finalized";
export type DependencyState = "current" | "stale" | "conflict";

export interface ScreenplayUnitRef {
  id: string;
  type: ScreenplayUnitType;
  parentId: string | null;
  order: number;
  title: string;
  readiness: UnitReadiness;
  dependencyState: DependencyState;
  currentVersionId: string | null;
}

export interface ScreenplayDocumentV1 {
  schemaVersion: "kiikis.screenplay/1";
  workId: string;
  units: ScreenplayUnitRef[];
}
```

- [ ] **Step 1：写 parser RED**：拒绝重复 unit ID、scene 无 episode parent、非法顺序、循环 parent、跨 Work version；允许 world/character/outline 为空时创建第一场。
- [ ] **Step 2：实现稳定结构工具**：`parseScreenplayDocument`、`orderUnits`、`findUnitAncestors`、`findDownstreamUnits`。
- [ ] **Step 3：GREEN**：固定输入序列化后 content hash 稳定。

## Task 3.2：Unit 身份、版本和依赖状态

**Files:**

- Create: `supabase/migrations/20260828030000_K22-P3_screenplay_units.sql`
- Create: `supabase/migrations/audits/audit_K22_P3_screenplay_units.sql`
- Create: `lib/server/v2/screenplays/units.ts`
- Create: `lib/server/v2/screenplays/dependencies.ts`
- Create: `app/api/v2/works/[workId]/screenplay/route.ts`
- Create: `app/api/v2/works/[workId]/screenplay/units/[unitId]/route.ts`
- Create: `app/api/v2/works/[workId]/screenplay/dependencies/route.ts`
- Test: `tests/server-v2/screenplays/units.test.mjs`
- Test: `tests/server-v2/screenplays/dependencies.test.mjs`

**Interfaces:** Produces unit CRUD through immutable unit versions；Work Version 保存整个 Screenplay Document 的选定 unit version index。

- [ ] **Step 1：写 RED**

覆盖自由创建/打开任意 unit、上游修改后下游只标 stale、不删除内容、Finalized unit 修改创建 child draft、并发编辑返回 409 和当前版本。

- [ ] **Step 2：实现 migration**

新增 `storyflow_screenplay_units`、append-only `storyflow_screenplay_unit_versions`、`storyflow_screenplay_dependency_edges`。Unit identity 可更新标题/顺序，内容只存在不可变 Unit Version；dependency edge 保存 source/target unit version。

- [ ] **Step 3：实现 stale 计算**

当上游 version 改变时，只把引用旧 version 的 edge 标为 stale。用户可执行：继续使用旧来源、重新生成候选、人工修订、确认无影响。任何动作都保留旧下游版本。

- [ ] **Step 4：旧项目适配**

从 `storyflow_projects.story_bible`、episodes、scenes 和现有 `storyflow_versions` 读取旧项目；首次保存时按稳定旧 ID 建立 units。禁止批量覆盖旧字段；旧页面在迁移期保持只读兼容跳转。

## Task 3.3：三栏剧本室与自由导航

**Files:**

- Create: `components/v2/screenplay-studio/ScreenplayStudio.tsx`
- Create: `components/v2/screenplay-studio/ScreenplayStudio.module.css`
- Create: `components/v2/screenplay-studio/UnitNavigator.tsx`
- Create: `components/v2/screenplay-studio/ScreenplayEditor.tsx`
- Create: `components/v2/screenplay-studio/StudioRightPanel.tsx`
- Create: `lib/client/v2/screenplay-studio/api.ts`
- Create: `lib/client/v2/screenplay-studio/types.ts`
- Modify: `app/script-workbench/page.tsx`
- Modify: `components/creation/CreationWorkbench.tsx`
- Modify: `lib/projects.ts`
- Test: `tests/ui-v2/screenplay-studio/layout.test.mjs`
- Test: `tests/ui-v2/screenplay-studio/navigation.test.mjs`
- Create: `e2e/v22-screenplay-navigation.spec.ts`

**Interfaces:** Consumes WorkbenchShell、Screenplay API、UniverseStatus；produces `activeUnitId` URL state (`?workId=&unitId=`) so refresh/back-forward restore the same writing location。

- [ ] **Step 1：写 UI RED**

断言：左栏世界观/角色/大纲/分集/正文树，中栏当前文档编辑器，右栏 KK/引用/版本/连续性；任一节点都可打开，不检查前一步 finalized。

- [ ] **Step 2：拆出新组件而非继续扩张巨型文件**

`CreationWorkbench.tsx` 只保留旧项目兼容入口，不在其中叠加新剧本室。`script-workbench` 对 V2.2 Work 渲染 `ScreenplayStudio`；旧 projectId 通过适配器解析 primary Work 后进入。

- [ ] **Step 3：实现自由导航与软门禁**

空内容显示建议和缺失信息，但“继续创作”始终可用。只有以下正式动作检查 Finalized：批量制作、发布、授权、正式交付包；草稿试做美术/分镜/配音自动冻结来源 Checkpoint。

- [ ] **Step 4：保存与恢复**

编辑保存创建 Unit Version + Work Editing Draft。刷新、切换 unit、退出重开后恢复 active unit、光标附近位置、未处理 candidate 和 stale 提示。

- [ ] **Step 5：响应式验证**

桌面三栏；窄屏使用可切换抽屉，不丢编辑状态。390/768/1440/2560 无水平溢出，键盘可完成导航、保存和候选操作。

## Task 3.4：KK 两种操作语义与 Candidate Diff

**Files:**

- Create: `components/v2/screenplay-studio/KkScreenplayRoom.tsx`
- Create: `components/v2/screenplay-studio/CandidateDiffPanel.tsx`
- Create: `lib/server/v2/screenplays/generation.ts`
- Create: `app/api/v2/works/[workId]/screenplay/discuss/route.ts`
- Create: `app/api/v2/works/[workId]/screenplay/propose-change/route.ts`
- Test: `tests/server-v2/screenplays/generation.test.mjs`
- Test: `tests/ui-v2/screenplay-studio/candidate-diff.test.mjs`
- Create: `e2e/v22-screenplay-ai.spec.ts`

**Interfaces:**

- `discuss`：append user message → Context Packet → assistant message；不创建内容版本。
- `propose_change`：append user message → Generation Snapshot → Candidate Diff；只有用户 apply 才创建 Unit/Work Version。

- [ ] **Step 1：写语义 RED**：聊一聊后 content hash 不变；生成修改方案前最新输入已持久化；候选可逐块接受/拒绝；未采用候选不改变正文。
- [ ] **Step 2：实现作用域**：选中文字、当前场、当前集、角色、世界观或全剧本。Snapshot 明确保存 scope、baseVersionId、messageIds、ContextPacketId。
- [ ] **Step 3：实现 Diff**：显示 before/after、受影响 units、Universe 引用和冲突；apply 采用选中 patch 并创建新版本，reject 只改变 candidate 状态。
- [ ] **Step 4：失败保护**：生成失败保留输入、消息、当前正文和旧候选；重试复用 request snapshot，不重复扣减或重复消息。

## Task 3.5：长剧本连续性与影响分析

**Files:**

- Create: `lib/server/v2/screenplays/continuity.ts`
- Create: `app/api/v2/works/[workId]/screenplay/continuity/route.ts`
- Create: `components/v2/screenplay-studio/ContinuityPanel.tsx`
- Create: `components/v2/screenplay-studio/ReferenceList.tsx`
- Test: `tests/server-v2/screenplays/continuity.test.mjs`
- Test: `tests/ui-v2/screenplay-studio/continuity.test.mjs`

- [ ] **Step 1：写定位 RED**：角色名字/关系/时间线/道具规则冲突必须定位到集、场、unit version 和文本范围；不能只返回“可能冲突”。
- [ ] **Step 2：实现增量索引**：按 Unit Version 建引用索引；修改单场只重算受影响单元，不每次扫描整部剧本。
- [ ] **Step 3：显示“本次引用”**：右栏展示 Context Packet 的 Universe 对象、版本和引用原因；用户可打开来源，不显示整包隐藏 prompt。
- [ ] **Step 4：影响处置**：用户选择忽略、修订、建立候选或提交 Universe Proposal；每个选择写 Evidence Event。

## Phase 3 完整验证

```bash
node --test tests/contracts-v22/screenplay-studio.test.mjs tests/server-v2/screenplays/*.test.mjs tests/ui-v2/screenplay-studio/*.test.mjs tests/creation-workbench-ui.test.mjs
npx playwright test e2e/v22-screenplay-navigation.spec.ts e2e/v22-screenplay-ai.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

使用至少一部 10 集、每集 20 场的真实匿名化剧本做手工验证：自由跳转、局部改写、刷新恢复、上游 stale、草稿试做分镜、正式交接。

## Gate 3

- 无小说入口和小说/剧本双轨。
- 世界观、角色、大纲、分集、正文可自由进入。
- 上游变化不删除下游，只产生可处置 stale。
- “聊一聊”不改内容，“生成修改方案”不经确认不落正文。
- 重开后会话、当前 unit、候选、版本和引用完整恢复。
- 长剧本冲突可定位到集、场和文本来源。
- 草稿可试做；正式动作只消费明确 Finalized Version。

## 禁止扩展

- 不在本阶段实现外部 Universe 文件导入。
- 不把剧本室塞回 ProductionWorkbench。
- 不用自动“下一步”恢复线性向导。
- 不让 AI 一键覆盖整部剧本或已 Finalized 内容。
