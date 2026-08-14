# Phase 0：真实入口与任务止血 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用测试驱动逐 Task 执行。只执行本阶段，完成后写 `handoffs/phase-0.md` 并停止。

**Goal:** 让工作流入口、Project/primary Work 创建、Dashboard、任务中心、KK、社区和演员市场首先恢复为真实可用链路。

**Architecture:** 新增最小 Work 身份表和原子创建 RPC，入口只提交模块类型。Dashboard、Task Center 和 KK 共用现有导航解析器与 Job API；社区和演员市场修复真实 schema/route 接线，不引入新业务模型。

**Tech Stack:** Next.js App Router、TypeScript、Supabase/Postgres/RLS、Node test runner、Playwright。

## Global Constraints

继承 [`README.md`](./README.md) 全部约束。新契约使用 `2.2.0-alpha.1`，旧 Job/Community/Actor V2 响应保持兼容。

---

## 前置与分支

- 前置：最新 `origin/main`。
- 分支：`trae/K22-P0-runtime-truth`。
- Migration：`supabase/migrations/20260828000000_K22-P0_work_identity.sql`。
- 推荐提交：
  1. `test(v2.2): define real entry and action regressions`
  2. `feat(v2.2): create project and primary work atomically`
  3. `fix(v2.2): restore dashboard job and kk actions`
  4. `fix(v2.2): connect community and actor market services`

## Task 0.1：最小 Work 身份与原子项目创建

**Files:**

- Create: `supabase/migrations/20260828000000_K22-P0_work_identity.sql`
- Create: `supabase/migrations/audits/audit_K22_P0_work_identity.sql`
- Create: `lib/contracts/v2/work.ts`
- Create: `lib/server/v2/works/index.ts`
- Create: `lib/server/v2/works/http.ts`
- Create: `app/api/v2/project-start/route.ts`
- Modify: `lib/client/v2/project-start/types.ts`
- Modify: `lib/client/v2/project-start/api.ts`
- Create: `app/voice-workbench/page.tsx`
- Test: `tests/server-v2/project-start/project-start.test.mjs`
- Test: `tests/ui-v2/project-start/project-start.test.mjs`

**Interfaces:**

- Produces `PublicWorkType = "script" | "song" | "art" | "storyboard" | "video" | "voice" | "editing"`。
- Produces internal `WorkType = PublicWorkType | "source"`；`source` 只允许 Phase 4 的服务端导入事务创建，不出现在工作流方格。
- Produces `POST /api/v2/project-start`，返回 `{ contract_version, projectId, workId, workType, workbenchRoute }`。
- Phase 1 在 `storyflow_works` 上追加版本和会话关系，不重建 Work 身份。

- [ ] **Step 1：写 API RED 测试**

覆盖认证、七种合法类型、`novel`/未知类型拒绝、客户端 owner 伪造忽略、重复 `Idempotency-Key` 返回同一 Project/Work、Project 或 Work 任一写入失败时全部回滚。

```js
assert.equal(result.contract_version, "2.2.0-alpha.1");
assert.equal(result.work.workType, "script");
assert.match(result.workbenchRoute, /^\/script-workbench\?projectId=/);
assert.equal(await countProjects(result.projectId), 1);
assert.equal(await countPrimaryWorks(result.projectId), 1);
```

运行并确认 RED：

```bash
node --test tests/server-v2/project-start/project-start.test.mjs tests/ui-v2/project-start/project-start.test.mjs
```

- [ ] **Step 2：新增 forward-only migration**

`storyflow_works` 至少包含：`id uuid`、`owner_id uuid`、`project_id text null`、`work_type text`、`title text`、`status text`、`is_primary boolean`、`created_at`、`updated_at`；建立每个 Project 仅一个 primary Work 的 partial unique index。公开七类 Work 必须有 project_id；内部 `source` Work 必须 `project_id is null` 且 `is_primary=false`。

```sql
check (work_type in ('script','song','art','storyboard','video','voice','editing','source'));
check (status in ('editing_draft','checkpoint','finalized','archived'));
create unique index ... on public.storyflow_works(project_id) where is_primary;
```

创建 `create_project_with_primary_work(...)` RPC，在同一事务插入 `storyflow_projects` 与 `storyflow_works`。RLS 只允许 owner 读写；普通客户端不得传入其他 owner。

- [ ] **Step 3：实现最小服务与路由**

```ts
export type CreateProjectWithWorkInput = {
  ownerId: string;
  title?: string;
  workType: PublicWorkType;
  universeId?: string | null;
  idempotencyKey: string;
};

export async function createProjectWithPrimaryWork(
  input: CreateProjectWithWorkInput,
): Promise<{ projectId: string; workId: string; workType: WorkType }>;
```

路由从服务端认证读取 `ownerId`；`workbenchRoute` 由共享解析器生成，不接受客户端 URL。

`voice` 映射到 `/voice-workbench`，该路由在本阶段读取真实 Project/Work 并显示明确的配音能力状态；Phase 5 在同一路由接入完整 CosyVoice 工作台。`editing` 映射到现有 `/editor`，不得另建平行剪辑入口。

- [ ] **Step 4：GREEN 与数据库审计**

运行 API 测试、migration audit、跨用户读取/写入拒绝和并发幂等测试。audit 必须证明无 Project 缺 primary Work、无 Project 多 primary Work。

## Task 0.2：工作流方格与 Dashboard 新建入口

**Files:**

- Modify: `components/v2/project-start/ProjectStartFlow.tsx`
- Modify: `components/v2/project-start/ProjectStartFlow.module.css`
- Modify: `lib/client/v2/project-start/helpers.ts`
- Modify: `lib/client/v2/navigation/resolver.ts`
- Modify: `components/v2/dashboard/DashboardClient.tsx`
- Modify: `components/v2/dashboard/DashboardSections.tsx`
- Test: `tests/ui-v2/project-start/project-start.test.mjs`
- Test: `tests/ui-v2/dashboard/dashboard.test.mjs`
- Test: `tests/ui-v2/navigation/resolver.test.mjs`
- Create: `e2e/v22-project-entry.spec.ts`

**Interfaces:** Consumes Phase 0 Task 0.1 API；produces stable module-to-route mapping for all later phases。

- [ ] **Step 1：写结构与浏览器 RED**

断言页面不存在自由文本输入、下拉创作类型和上传按钮；只出现七张同规格模块卡。Dashboard“新建项目”先打开选择器，不直接导航。

```ts
expect(screen.queryByPlaceholderText(/描述你的故事/)).toBeNull();
expect(workflowCards.map((card) => card.type)).toEqual([
  "script", "song", "art", "storyboard", "video", "voice", "editing",
]);
```

- [ ] **Step 2：删除旧入口行为并接入真实创建**

点击卡片立即调用 Task 0.1 API；成功后以服务端返回的 `projectId/workId` 进入对应工作台。标题默认为“未命名剧本/歌曲/美术/分镜/视频/配音/剪辑”，进入后可修改。创建失败保留选择器并提供重试，不产生本地伪 ID。

- [ ] **Step 3：验证响应式与键盘操作**

Playwright 在 390、768、1440、2560 宽度验证无水平溢出；卡片可 Tab 聚焦、Enter/Space 激活；重复点击只产生一个 Project/Work。

## Task 0.3：Dashboard 与 Job 真实动作

**Files:**

- Modify: `lib/contracts/v2/index.ts`
- Modify: `lib/server/v2/jobs/index.ts`
- Modify: `app/api/v2/jobs/[id]/route.ts`
- Modify: `components/v2/task-center/TaskCenter.tsx`
- Modify: `components/v2/task-center/TaskCard.tsx`
- Modify: `components/v2/dashboard/DashboardSections.tsx`
- Create: `app/job-center/[jobId]/page.tsx`
- Create: `components/v2/task-center/JobDetail.tsx`
- Test: `tests/server-v2/jobs/jobs.test.mjs`
- Test: `tests/ui-v2/task-center/task-center.test.mjs`
- Test: `tests/ui-v2/dashboard/dashboard.test.mjs`
- Create: `e2e/v22-job-actions.spec.ts`

**Interfaces:** `GenerationJob` 以可选字段向后兼容扩展 `workId`、`workbenchType`、`targetType/targetId`、`detailUrl`、`resultUrl`；旧字段不删除。

- [ ] **Step 1：写状态转换 RED**

覆盖 queued/running 可 cancel、failed/partial_failure 可 retry、completed 可 view_results、所有可见详情按钮必须有稳定 `/job-center/:jobId`。取消必须调用服务端转换，不允许只改 React state。

- [ ] **Step 2：实现窄动作 API**

在 `PATCH /api/v2/jobs/:id` 中只接受 `{ action: "cancel" | "retry" }`，服务端校验当前状态和 owner。无法取消 Provider 任务时写 `cancel_requested` 语义到 metadata 并阻止新使用；不得把已完成任务改回 cancelled。

- [ ] **Step 3：实现 Job 详情页和共享 resolver**

Dashboard、任务中心、KK 都使用 `lib/client/v2/navigation/resolver.ts`。详情页展示真实状态、进度、错误、目标和结果动作；缺目标时按钮禁用并显示原因。

- [ ] **Step 4：GREEN**

```bash
node --test tests/server-v2/jobs/jobs.test.mjs tests/ui-v2/navigation/resolver.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs tests/ui-v2/task-center/*.test.mjs
npx playwright test e2e/v22-job-actions.spec.ts --project=chromium
```

## Task 0.4：KK 真实目标

**Files:**

- Modify: `lib/client/v2/kk/task-projection.ts`
- Modify: `components/v2/kk/KkMessageItem.tsx`
- Modify: `components/v2/kk/KkPanel.tsx`
- Test: `tests/ui-v2/kk/kk.test.mjs`
- Create: `e2e/v22-kk-actions.spec.ts`

- [ ] **Step 1：写 RED**：确认每个显示动作都含合法 actionUrl 或明确禁用原因；禁止仅显示进度文本。
- [ ] **Step 2：接入共享目标**：Job → Job Detail，等待确认 → candidate/review，完成 → Work/Asset；非法外部 URL 不传给 `router.push`。
- [ ] **Step 3：验证一致性**：同一 Job 在 Dashboard、任务中心、KK 的 status、progress、actions 相同。

## Task 0.5：社区与演员市场真实接线

**Files:**

- Modify: `lib/server/v2/community/discovery.ts`
- Modify: `app/api/v2/community/discover/route.ts`
- Modify: `components/v2/community/DiscoveryFeed.tsx`
- Modify: `lib/client/v2/marketplace/api.ts`
- Modify: `components/marketplace/ActorMarketSection.tsx`
- Modify: `app/api/actors/platform/route.ts`
- Test: `tests/kiikis-21-community-publications.test.mjs`
- Test: `tests/ui-v2/marketplace/api-adapter.test.mjs`
- Test: `tests/actors-platform-visibility.test.mjs`
- Create: `e2e/v22-market-services.spec.ts`

- [ ] **Step 1：复现并保存真实错误**：记录 discovery 查询的表、字段、RLS 和 correlationId；演员列表记录前端请求 URL 与仓库实际 route。
- [ ] **Step 2：写 RED**：真实 schema 投影通过；缺 migration 返回带 correlationId 的 `service_unavailable`；演员列表、详情、购买/授权入口共用真实 ID。
- [ ] **Step 3：最小接线**：修正 schema 投影和 route，不吞掉数据库原始错误类别；空 Feed 只能表示确实无 Publication。
- [ ] **Step 4：真实环境验证**：至少一条 Publication 可打开来源，一名已发布演员可进入详情；权利受限项目不可公开或商业调用。

## Phase 0 完整验证

```bash
node --test tests/server-v2/project-start/project-start.test.mjs tests/server-v2/jobs/jobs.test.mjs tests/ui-v2/project-start/project-start.test.mjs tests/ui-v2/navigation/resolver.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs tests/ui-v2/task-center/*.test.mjs tests/ui-v2/kk/kk.test.mjs tests/kiikis-21-community-publications.test.mjs tests/ui-v2/marketplace/*.test.mjs tests/actors-platform-visibility.test.mjs
npx playwright test e2e/v22-project-entry.spec.ts e2e/v22-job-actions.spec.ts e2e/v22-kk-actions.spec.ts e2e/v22-market-services.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## Gate 0

- 七模块入口无输入框、无分组、无小说。
- 每次创建都产生一个真实 Project 和一个 primary Work。
- Dashboard、任务中心和 KK 没有点击无响应。
- Job cancel/retry 是服务端真实状态转换。
- 社区和演员市场使用真实服务；fixture 关闭后仍通过。
- 既有 `2.0.0-alpha.1` 消费者回归通过。

## 禁止扩展

- 不在本阶段实现 Work Version、Conversation Ledger 或 Universe Manifest。
- 不重做工作台内部编辑器。
- 不新增社区推荐算法或演员交易规则。
- 不用 demo Project/Job/Publication/Actor ID 掩盖数据缺失。
