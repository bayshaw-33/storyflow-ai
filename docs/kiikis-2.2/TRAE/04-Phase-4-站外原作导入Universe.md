# Phase 4：站外原作导入 Universe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用测试驱动逐 Task 执行。只执行本阶段，完成后写 `handoffs/phase-4.md` 并停止。

**Goal:** 支持用户上传一份完整剧本，或同时上传世界观、角色圣经、剧情大纲三份文件，审核后建立只读 Source Work 和 Universe U1。

**Architecture:** 原文件先持久化并计算 hash，再由后台 Import Job 分块提取候选。候选保留 Source Location，用户在审核台逐项决定；只有通过质量和权利门禁后，RPC 才原子建立 Source Version、Universe U1、来源关系和 Evidence。

**Tech Stack:** Next.js upload APIs、Supabase Storage/Postgres/RLS、PDF/DOCX/Markdown/TXT parser、现有 Job/Event 服务、React review workbench。

## Global Constraints

继承 [`README.md`](./README.md) 全部约束。Source Work 和原文件不可修改；上传声明与 AI 提取只记录事实，不构成法律裁定。

---

## 前置与分支

- 前置：Phase 3 Gate PASS；读取 `handoffs/phase-3.md`。
- 分支：`trae/K22-P4-universe-import`。
- Migration：`supabase/migrations/20260828040000_K22-P4_universe_import.sql`。
- 推荐提交：
  1. `test(v2.2): define universe import state machine`
  2. `feat(v2.2): persist source works and import sessions`
  3. `feat(v2.2): extract long source documents`
  4. `feat(v2.2): add universe import review`
  5. `feat(v2.2): finalize universe u1 atomically`

## Task 4.1：导入契约与状态机

**Files:**

- Create: `lib/contracts/v2/universe-import.ts`
- Create: `lib/server/v2/universe-import/state-machine.ts`
- Test: `tests/contracts-v22/universe-import.test.mjs`
- Test: `tests/server-v2/universe-import/state-machine.test.mjs`

**Interfaces:**

```ts
export type ImportMode = "complete_screenplay" | "bible_triplet";
export type ImportState =
  | "upload_draft" | "uploaded" | "extracting" | "review_required"
  | "degraded" | "ready_for_u1" | "u1_ready" | "failed" | "cancelled";
export type SourceRole = "screenplay" | "world_bible" | "character_bible" | "plot_outline" | "supplement";

export interface SourceLocation {
  fileId: string;
  page?: number;
  section?: string;
  episode?: number;
  scene?: number;
  startOffset: number;
  endOffset: number;
  sourceHash: string;
}
```

- [ ] **Step 1：写状态机 RED**：禁止 extracting 前缺文件、degraded→u1_ready、u1_ready 后修改 Source Version、cancelled 恢复写入。
- [ ] **Step 2：实现门禁**：complete_screenplay 恰有一个 screenplay 主文件；bible_triplet 必须同时具备 world_bible、character_bible、plot_outline，缺一只能保存 Upload Draft。
- [ ] **Step 3：格式验证**：首期主文件只接受 PDF、DOCX、DOC、MD、TXT；JSON/HTML/CSV/XLSX 仅可作为 supplement，不替代三件套。

## Task 4.2：Import Session、Source Work 与持久文件

**Files:**

- Create: `supabase/migrations/20260828040000_K22-P4_universe_import.sql`
- Create: `supabase/migrations/audits/audit_K22_P4_universe_import.sql`
- Create: `lib/server/v2/universe-import/index.ts`
- Create: `lib/server/v2/universe-import/storage.ts`
- Create: `app/api/v2/universe-imports/route.ts`
- Create: `app/api/v2/universe-imports/[sessionId]/files/route.ts`
- Create: `app/api/v2/universe-imports/[sessionId]/start/route.ts`
- Test: `tests/server-v2/universe-import/sessions.test.mjs`
- Test: `tests/server-v2/universe-import/storage.test.mjs`

**Interfaces:** Produces resumable Import Session APIs and private storage object keys；Phase 4 后续任务只使用 `sessionId/sourceFileId/sourceVersionId`，不使用浏览器临时 blob URL。

- [ ] **Step 1：写 RED**

覆盖认证、MIME/扩展名双重校验、大小/页数限制、重复 hash 幂等、跨用户访问、上传中断恢复、原文件 URL 不公开。

- [ ] **Step 2：实现 migration**

新增：

- `storyflow_universe_import_sessions`
- `storyflow_source_works`：`work_id` 为主键并引用 Phase 0 `storyflow_works(id)`；对应 Work 的 `work_type='source'`、`project_id is null`、`is_primary=false`
- append-only `storyflow_source_versions`
- `storyflow_universe_import_files`
- `storyflow_source_chunks`
- `storyflow_universe_import_candidates`
- append-only `storyflow_universe_import_decisions`

创建私有 `universe-source-imports` bucket 和 owner path policy。Source Version 保存 file hash 集合、rights declaration snapshot 和 immutable manifest。

- [ ] **Step 3：实现上传闭环**

服务端签发上传目标；完成回调重新读取对象 metadata 并计算/核验 SHA-256。只有全部必需文件持久化后 state 才能进入 uploaded。

- [ ] **Step 4：恢复和取消**

列表 API 返回未完成 session；关闭页面不取消 Job。取消只阻止后续处理，保留原始事实和审计，临时未确认上传按明确保留策略清理。

## Task 4.3：长文档解析、分块与候选提取

**Files:**

- Create: `lib/server/v2/universe-import/parsers/pdf.ts`
- Create: `lib/server/v2/universe-import/parsers/docx.ts`
- Create: `lib/server/v2/universe-import/parsers/text.ts`
- Create: `lib/server/v2/universe-import/chunker.ts`
- Create: `lib/server/v2/universe-import/extraction.ts`
- Create: `lib/server/v2/universe-import/merge-candidates.ts`
- Create: `app/api/v2/universe-imports/[sessionId]/jobs/[jobId]/route.ts`
- Test: `tests/server-v2/universe-import/parsers.test.mjs`
- Test: `tests/server-v2/universe-import/chunker.test.mjs`
- Test: `tests/server-v2/universe-import/extraction.test.mjs`
- Create: `tests/fixtures/universe-import/long-screenplay.txt`

**Interfaces:** Produces candidates of kind `entity | fact | relationship | timeline_event | conflict`，每条候选必须含一个或多个 `SourceLocation`。

- [ ] **Step 1：写全文覆盖 RED**：使用至少 100 页等价文本，断言首尾页均进入 chunk index；chunk overlap 不丢跨边界角色/关系；重复候选合并但保留全部来源。
- [ ] **Step 2：实现 parser**：PDF 保留页码，DOCX 保留标题/段落，TXT/MD 保留行号和 offset；加密/扫描 PDF 无文本时进入 degraded，并说明需要 OCR/可读文件。
- [ ] **Step 3：实现确定性 chunking**：按章节/集/场优先切分，再按 token 预算补切；每块记录前后 overlap 和 source offsets。
- [ ] **Step 4：实现后台 Job**：解析、提取、合并、质量检查分阶段写 Job Event；重试按 chunk idempotency key，不重复候选。
- [ ] **Step 5：质量门禁**：缺后半部覆盖、来源定位失效、必需类型为空或模型输出无法解析时 state=degraded，不允许建立 U1。

## Task 4.4：三栏候选审核台

**Files:**

- Create: `components/v2/universe-import/UniverseImportWizard.tsx`
- Create: `components/v2/universe-import/UniverseImportReview.tsx`
- Create: `components/v2/universe-import/SourceViewer.tsx`
- Create: `components/v2/universe-import/CandidateList.tsx`
- Create: `components/v2/universe-import/CandidateEditor.tsx`
- Create: `components/v2/universe-import/universe-import.module.css`
- Create: `lib/client/v2/universe-import/api.ts`
- Modify: `app/universes/page.tsx`
- Modify: `components/v2/universe/UniverseWorkbenchClient.tsx`
- Create: `app/universes/import/[sessionId]/page.tsx`
- Test: `tests/ui-v2/universe-import/universe-import.test.mjs`
- Create: `e2e/v22-universe-import-review.spec.ts`

- [ ] **Step 1：写入口 RED**：Universe“新建”显示从零创建、从现有 Work 建立、上传站外原作建立三个入口；无 Project 用户也能选择第三项。
- [ ] **Step 2：实现上传模式**：完整剧本单文件；三件套按角色分别上传，缺一时明确显示并禁止开始提取；权利声明为必填事实快照。
- [ ] **Step 3：实现审核台**：左栏分类/状态，中栏候选编辑与接受/拒绝/合并，右栏原文定位；每个决定 append-only，刷新后恢复。
- [ ] **Step 4：批量操作保护**：批量接受只处理当前筛选和明确选择；conflict、低置信和无来源候选不能批量自动接受。
- [ ] **Step 5：恢复卡**：Universe 列表持续显示上传/提取/审核进度，点击回到相同 session 和筛选位置。

## Task 4.5：原子建立 Universe U1 与修订版

**Files:**

- Create: `lib/server/v2/universe-import/finalize.ts`
- Create: `app/api/v2/universe-imports/[sessionId]/finalize/route.ts`
- Create: `app/api/v2/source-works/[sourceWorkId]/versions/route.ts`
- Modify: `lib/server/v2/universe/index.ts`
- Modify: `lib/server/v2/proposals/index.ts`
- Test: `tests/server-v2/universe-import/finalize.test.mjs`
- Test: `tests/server-v2/universe-import/revisions.test.mjs`
- Create: `e2e/v22-universe-import-finalize.spec.ts`

- [ ] **Step 1：写原子性 RED**：任一候选写入失败时 Universe、U1、Source Work Link 和 Evidence 均不产生；重复 finalize 返回同一 U1。
- [ ] **Step 2：实现 `finalize_universe_import_v22` RPC**：只接受 ready_for_u1 session；创建内部只读 source Work、锁定 Source Version、Universe、Universe U1、已接受 Canon 对象、来源关系和 Evidence Event，不创建假 Project。
- [ ] **Step 3：Source Work 只读**：UI 可查看和下载原始 Source Version，不显示编辑/覆盖操作；修订文件创建 Source Version v2。
- [ ] **Step 4：修订升级**：v2 重新提取并生成 Universe Upgrade Proposal；U1 不变，用户审核后才发布 U2。
- [ ] **Step 5：权利状态**：默认 private；权利不明确或受限时禁止公开、商业授权和他人二创，但 owner 可在私有范围分析。

## Phase 4 完整验证

```bash
node --test tests/contracts-v22/universe-import.test.mjs tests/server-v2/universe-import/*.test.mjs tests/ui-v2/universe-import/*.test.mjs
npx playwright test e2e/v22-universe-import-review.spec.ts e2e/v22-universe-import-finalize.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

分别使用：长篇完整剧本、三件套、缺一件三件套、扫描 PDF、重复文件、修订版 v2、权利受限声明做真实验证。

## Gate 4

- 无 Project 用户可启动导入。
- 完整剧本覆盖全文，三件套缺一不可建立 U1。
- 原文件、Source Work 和 Source Version 不可变。
- 每个候选可定位到原文，关闭页面后可恢复。
- degraded 不能 finalize。
- U1 建立原子、幂等、可审计。
- 修订版产生新 Source Version 和 Upgrade Proposal，不覆盖 U1。
- 权利受限 Universe 保持私有且不可商业授权。

## 禁止扩展

- 不在本阶段增加 OCR 服务；扫描件明确 degraded 即可。
- 不自动接受全部 Canon 候选。
- 不把上传声明写成“版权已认证”。
- 不允许通过重新上传覆盖 Source Version v1。
