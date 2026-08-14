# Phase 6：集成 UAT 与发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 先执行验证，只有可复现的 P0/P1 缺陷才允许修改代码。完成后写 `handoffs/phase-6.md` 并停止。

**Goal:** 用真实数据跑通 V2.2 六条端到端旅程，验证迁移、RLS、性能、观测、灰度和回滚后再发布。

**Architecture:** 新增发布审计脚本和端到端验收套件，不再扩展产品范围。所有环境通过同一 feature/runtime mode，灰度只控制入口可见性，不复制第二套数据模型。

**Tech Stack:** Node audit scripts、Playwright、Supabase migration/RLS checks、Next.js production build、现有监控日志。

## Global Constraints

继承 [`README.md`](./README.md) 全部约束。Phase 6 不接受“测试数据可用所以生产可用”的结论；必须在 production-like schema 和真实登录态验证。

---

## 前置与分支

- 前置：Phase 5 Gate PASS；读取 `handoffs/phase-5.md`。
- 分支：`trae/K22-P6-release-uat`。
- 默认无新 migration；若 UAT 发现 schema 缺陷，只能新增 `supabase/migrations/20260828060000_K22-P6_release_fixes.sql`，不得修改 Phase 0–5 migration，并在该文件中仅修复已复现的发布阻断 schema 问题。
- 推荐提交：
  1. `test(v2.2): add release journey coverage`
  2. `chore(v2.2): add runtime migration and fixture audits`
  3. `fix(v2.2): resolve release blocking defects`
  4. `docs(v2.2): add release and rollback runbook`

## Task 6.1：需求覆盖与契约兼容审计

**Files:**

- Create: `tests/contracts-v22/prd-coverage.test.mjs`
- Create: `tests/contracts-v22/backward-compatibility.test.mjs`
- Create: `scripts/audit-kiikis-22-contracts.mjs`
- Modify: `package.json`
- Test: `docs/kiikis-2.2/KIIKIS-2.2-总PRD-v1.0.md`

- [ ] **Step 1：建立机器可读覆盖表**：把 `K22-G`、`ENTRY`、`JOB`、`SW`、`UNI`、`IMP`、`SONG`、`MKT` 验收 ID 映射到至少一个自动测试文件；重复 ID、无测试 ID 或测试文件不存在时失败。
- [ ] **Step 2：旧契约快照**：保存并校验关键 `2.0.0-alpha.1` API 字段，确认 V2.2 只新增可选字段或新路由。
- [ ] **Step 3：新增命令**：

```json
{
  "scripts": {
    "audit:kiikis22": "node scripts/audit-kiikis-22-contracts.mjs && node scripts/audit-kiikis-22-runtime.mjs && node scripts/audit-kiikis-22-migrations.mjs"
  }
}
```

- [ ] **Step 4：先故意删除一个映射确认 audit 失败，再恢复并确认通过**。

## Task 6.2：Runtime、fixture、迁移与 RLS 发布审计

**Files:**

- Create: `scripts/audit-kiikis-22-runtime.mjs`
- Create: `scripts/audit-kiikis-22-migrations.mjs`
- Modify: `lib/server/v2/feature-flags.ts`
- Modify: `lib/client/v2/runtime-mode.ts`
- Modify: `.env.example`
- Create: `tests/security/kiikis-22-rls.test.mjs`
- Create: `tests/security/kiikis-22-storage.test.mjs`

- [ ] **Step 1：fixture fail-closed RED**：`NODE_ENV=production` 且任何 `NEXT_PUBLIC_USE_*_FIXTURE=true` 时 audit 必须非零退出；staging 同样执行。
- [ ] **Step 2：迁移顺序审计**：确认 Phase 0–5 migration 唯一、forward-only、均晚于已存在 migration；生产 schema 必含所有表/索引/trigger/RPC/storage policy。
- [ ] **Step 3：RLS 矩阵**：owner、其他用户、匿名和 service role 覆盖 Work、Version、Conversation、Manifest、Snapshot、Source Work、Import、Usage Link、Evidence；普通用户 UPDATE/DELETE append-only 表必须失败。
- [ ] **Step 4：存储矩阵**：Source Import、Evidence、Voice/Video Asset 私有对象不得被跨用户读取；签名 URL 过期后不可用。
- [ ] **Step 5：真实数据健康检查**：Community Publication、Actor Listing、Job、Universe、Work 均至少有一条符合状态的数据；无数据返回 empty，不得返回 service unavailable。

## Task 6.3：六条端到端 Journey

**Files:**

- Create: `e2e/v22-journey-a-screenplay.spec.ts`
- Create: `e2e/v22-journey-b-universe-work.spec.ts`
- Create: `e2e/v22-journey-c-source-import.spec.ts`
- Create: `e2e/v22-journey-d-song.spec.ts`
- Create: `e2e/v22-journey-e-jobs-kk.spec.ts`
- Create: `e2e/v22-journey-f-market.spec.ts`
- Create: `e2e/support/v22-evidence.ts`
- Create: `e2e/support/v22-test-data.ts`

**Interfaces:** 每条 Journey 独立创建 owner-scoped 测试数据，以 API 清理自己的测试记录；不得删除共享或用户数据。

- [ ] **Step 1：Journey A 剧本室**：新建→自由进入第一场→讨论→候选 Diff→Checkpoint→重开恢复→草稿试做分镜→Finalized 交接。
- [ ] **Step 2：Journey B Universe 新作品**：U1→创建剧本 Work→选择继承→查看引用→发布 U2→确认 Work 不变→逐项采用。
- [ ] **Step 3：Journey C 站外原作**：无 Project→上传完整剧本→关闭恢复→全文候选→审核→原子 U1→二创 Work→Evidence。
- [ ] **Step 4：Journey D 歌曲**：打开历史歌曲→消息完整→输入新要求→生成 Snapshot 含最新输入→候选应用→留痕下载。
- [ ] **Step 5：Journey E Job/KK**：运行 Job→Dashboard/Task Center/KK 一致→详情→取消/重试→查看真实结果。
- [ ] **Step 6：Journey F 社区/演员**：Feed→Publication 来源→演员详情→License/Grant→项目调用；权利受限项被服务端拒绝。
- [ ] **Step 7：每条 Journey 校验 Evidence**：下载 ZIP，校验 manifest schema、sha256、Work/Version/Universe/Job/Asset 引用，不只验证 HTTP 200。

## Task 6.4：性能、恢复与可访问性

**Files:**

- Create: `tests/performance/v22-screenplay-budget.test.mjs`
- Create: `tests/performance/v22-import-budget.test.mjs`
- Create: `e2e/v22-accessibility-responsive.spec.ts`
- Create: `e2e/v22-recovery.spec.ts`
- Production files: 本 Task 不预先授权修改生产代码；测试失败时先在 handoff 记录精确根因和目标文件，再建立同阶段 P0/P1 修复 commit。

- [ ] **Step 1：剧本预算**：10 集×20 场项目重开不加载全 Universe/全会话；分页和 Context Packet 请求有上限；单场保存不重算全部 units。
- [ ] **Step 2：导入恢复**：长文档 Job 页面关闭/网络断开后继续；重复回调不重复 candidate/U1；worker 重启可从 chunk checkpoint 恢复。
- [ ] **Step 3：媒体恢复**：Provider 超时、临时 URL 失效、WebCodecs 不支持均显示可执行退路；历史 Asset Version 不受影响。
- [ ] **Step 4：可访问性/响应式**：390、768、1440、1920、2560；键盘操作方格、剧本导航、Diff、审核、Job；状态不只依赖颜色。
- [ ] **Step 5：错误观测**：每个 API 错误含 stable code + correlationId；日志可按 user-safe request ID 关联，不记录私有正文、prompt、token 或 secret。

## Task 6.5：灰度、监控与回滚演练

**Files:**

- Create: `docs/kiikis-2.2/release/V2.2-release-runbook.md`
- Create: `docs/kiikis-2.2/release/V2.2-rollback-runbook.md`
- Create: `docs/kiikis-2.2/release/V2.2-known-risks.md`
- Create: `scripts/smoke-kiikis-22.mjs`
- Modify: `.github/workflows/ci.yml`（若仓库实际 CI 文件名不同，修改承载 build/test 的现有 workflow 并在 handoff 记录映射）

- [ ] **Step 1：定义灰度开关**：只控制 V2.2 入口和路由选择；所有数据使用同一表和契约。关闭开关后旧项目仍可读，V2.2 数据不删除。
- [ ] **Step 2：定义监控**：创建成功率、会话恢复、最新输入丢失、静默覆盖、Import→U1、Job 动作、Community/Actor service unavailable、Evidence 下载。
- [ ] **Step 3：回滚演练**：回滚 Web release 和关闭入口；不回滚 forward migration。验证旧 UI 可继续读 Project，V2.2 Work/Source 数据保持安全。
- [ ] **Step 4：灰度顺序**：内部账号→小比例创作者→剧本高频用户→全部用户。每级至少完整跑六条 smoke 中适用旅程，并检查错误率。
- [ ] **Step 5：发布停线条件**：会话丢失、历史覆盖、跨用户数据访问、U1 非原子、未授权公开/商业使用、migration/audit 失败任一出现立即停止。

## Phase 6 完整验证

```bash
pnpm audit:kiikis22
node --test tests/contracts-v22/*.test.mjs tests/security/kiikis-22-*.test.mjs tests/performance/v22-*.test.mjs
npx playwright test e2e/v22-journey-*.spec.ts e2e/v22-accessibility-responsive.spec.ts e2e/v22-recovery.spec.ts --project=chromium
node scripts/smoke-kiikis-22.mjs
npx tsc --noEmit
pnpm build
```

将完整输出、测试数据 ID、环境、时间、截图/录像、migration version 和 commit SHA 写入 handoff。不得只粘贴摘要。

## Gate 6 / Release Decision

- 总 PRD 第 19 节六条 Journey 全部 PASS。
- 第 22 节问题追踪矩阵每项有自动或真实手工证据。
- fixture、migration、RLS、storage 和兼容审计全 PASS。
- 无 P0/P1 未解决缺陷，无静默数据覆盖或跨用户访问。
- production-like 环境社区和演员市场使用真实数据。
- 监控、灰度和回滚演练完成。
- 最终由用户或指定验收者给出 `RELEASE APPROVED`；TRAE 不自行发布。

## 禁止扩展

- 不在 UAT 阶段新增功能、重做视觉或替换技术选型。
- 不为通过测试降低断言或改成 fixture。
- 不执行破坏性数据库回滚。
- 不在没有 `RELEASE APPROVED` 时合并、推送生产或开启全量入口。
