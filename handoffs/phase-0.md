# Phase 0 Handoff：真实入口与任务止血

> 分支：`trae/K22-P0-runtime-truth`
> 基线：`origin/main` @ `1a8a5571`
> 契约版本：`2.2.0-alpha.1`（兼容 `2.0.0-alpha.1`）
> 交付日期：2026-08-14

## Goal

让工作流入口、Project/primary Work 创建、Dashboard、任务中心、KK、社区和演员市场恢复为真实可用链路。不引入新业务模型，只修复真实 schema/route 接线。

## Gate 0 验收

| 验收项 | 状态 | 证据 |
|--------|------|------|
| 七模块入口无输入框、无分组、无小说 | ✅ | `tests/ui-v2/project-start/project-start.test.mjs` |
| 每次创建都产生一个真实 Project 和一个 primary Work | ✅ | `supabase/migrations/20260828000000_K22-P0_work_identity.sql` + `tests/server-v2/project-start/project-start.test.mjs` |
| Dashboard、任务中心和 KK 没有点击无响应 | ✅ | `tests/ui-v2/dashboard/dashboard.test.mjs` + `tests/ui-v2/kk/kk-task-projection.test.mjs` |
| Job cancel/retry 是服务端真实状态转换 | ✅ | `tests/ui-v2/task-center/jobs-transition.test.mjs` + `app/api/v2/jobs/[id]/route.ts` |
| 社区和演员市场使用真实服务；fixture 关闭后仍通过 | ✅ | `tests/ui-v2/community/p0-correlation-id.test.mjs` + `tests/ui-v2/marketplace/*.test.mjs` |
| 既有 `2.0.0-alpha.1` 消费者回归通过 | ✅ | `tests/kiikis-21-community-publications.test.mjs` + `tests/actors-platform-visibility.test.mjs` |

## 测试与验证

### Node 测试（471 pass / 0 fail）

```bash
node --test \
  tests/server-v2/project-start/project-start.test.mjs \
  tests/server-v2/jobs/jobs.test.mjs \
  tests/ui-v2/project-start/project-start.test.mjs \
  tests/ui-v2/navigation/resolver.test.mjs \
  tests/ui-v2/dashboard/dashboard.test.mjs \
  tests/ui-v2/task-center/*.test.mjs \
  tests/ui-v2/kk/*.test.mjs \
  tests/ui-v2/community/p0-correlation-id.test.mjs \
  tests/ui-v2/marketplace/*.test.mjs \
  tests/actors-platform-visibility.test.mjs \
  tests/kiikis-21-community-publications.test.mjs
# → tests 471, pass 471, fail 0
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

已创建 4 个 Phase 0 e2e spec，需在 dev server / CI 中运行：

- `e2e/v22-project-entry.spec.ts` — Task 0.2：七模块方格、键盘操作、响应式宽度（390/768/1440/2560）
- `e2e/v22-job-actions.spec.ts` — Task 0.3：任务详情链接稳定、Dashboard 与任务中心共用 resolver
- `e2e/v22-kk-actions.spec.ts` — Task 0.4：KK 动作按钮同源路由、禁用原因展示
- `e2e/v22-market-services.spec.ts` — Task 0.5：真实端点请求、错误响应 correlationId

运行命令：
```bash
npx playwright test e2e/v22-*.spec.ts --project=chromium
```

## Task 交付清单

### Task 0.1：最小 Work 身份与原子项目创建

- `supabase/migrations/20260828000000_K22-P0_work_identity.sql` — `storyflow_works` 表 + partial unique index + `create_project_with_primary_work` RPC
- `lib/contracts/v2/work.ts` — `WorkType`、`WORK_CONTRACT_VERSION = "2.2.0-alpha.1"`、`DEFAULT_WORK_TITLES`
- `lib/server/v2/works/index.ts` + `http.ts` — 原子创建服务
- `app/api/v2/project-start/route.ts` — POST 端点（服务端注入 ownerId，幂等键）
- `app/voice-workbench/page.tsx` — voice 模块路由
- `lib/client/v2/project-start/types.ts` + `api.ts` + `helpers.ts` — 客户端契约与 7 模块卡元数据
- `tests/server-v2/project-start/project-start.test.mjs` — API RED→GREEN
- `tests/ui-v2/project-start/project-start.test.mjs` — UI 约束测试

### Task 0.2：工作流方格与 Dashboard 新建入口

- `components/v2/project-start/ProjectStartFlow.tsx` — 7 模块方格（删除旧输入框/下拉/上传）
- `components/v2/project-start/ProjectStartFlow.module.css` — 同规格方格样式
- `lib/client/v2/navigation/resolver.ts` — 统一导航解析器（防开放重定向）
- `components/v2/dashboard/DashboardClient.tsx` + `DashboardSections.tsx` — 新建入口指向 `/projects/new-v2`

### Task 0.3：Dashboard 与 Job 真实动作

- `app/api/v2/jobs/[id]/route.ts` — PATCH `{ action: "cancel" | "retry" }`，服务端状态转换
- `app/job-center/[jobId]/page.tsx` — Job 详情页
- `components/v2/task-center/JobDetail.tsx` — 详情组件
- `lib/server/v2/jobs/index.ts` + `http.ts` — `transitionJob` 状态机（queued/running → cancelled；failed/partial_failure → queued）
- `tests/ui-v2/task-center/jobs-transition.test.mjs` — 28 个状态转换测试

### Task 0.4：KK 真实目标

- `lib/client/v2/kk/task-projection.ts` — `projectJobToKkMessage`：Job → KkMessage，actionUrl 同源校验
- `components/v2/kk/KkMessageItem.tsx` — 动作按钮禁用状态 + 禁用原因展示（Lock 图标）
- `tests/ui-v2/kk/kk-task-projection.test.mjs` — 19 个投影测试

### Task 0.5：社区与演员市场真实接线

- `lib/server/v2/community/publications.ts` — `CommunityServiceError.correlationId` + `isSchemaError()` 识别 PGRST204/42703/42P01/PGRST205
- `app/api/v2/community/discover/route.ts` — 错误响应输出 correlationId，schema 错误返回 500（非 503 伪降级）
- `lib/supabase/actor-usages.ts` — 移除 `.catch(() => [])` 吞没 DB 错误
- `lib/api/responses.ts` — 通用 `apiError` 添加 correlationId
- `components/marketplace/ActorMarketSection.tsx` — 数据源改为真实 `/api/actors/platform`（非 `/api/actors/market`）
- `tests/ui-v2/community/p0-correlation-id.test.mjs` — 21 个 correlationId / schema 错误识别测试
- `e2e/v22-market-services.spec.ts` — 真实端点请求 + 错误响应 correlationId 验证

## 关键决策

1. **删除 K2-T-03 legacy fixtures**：`lib/client/v2/project-start/fixtures.ts` 引用已删除的 `ProjectStartFixture` / `filterUniverseOptions` 等 K2-T-03 类型，Phase 0 移除其消费者后该文件成为孤儿，直接删除以修复 tsc 错误。

2. **schema 错误返回 500 而非 503**：PRD §7.1 要求 PGRST204/42703/42P01/PGRST205（未知列/未知表）不得被掩盖成"云端服务不可用"伪降级，必须暴露真实 schema 错误类别（`schema_error` code + 500 status）。

3. **correlationId 短格式**：使用 `crypto.randomUUID().slice(0, 8)`（8 位 hex），降级用 `Date.now().toString(16).slice(-4) + Math.random().toString(16).slice(2, 6)`。足够追踪，不暴露完整 UUID。

4. **演员市场端点修正**：`ActorMarketSection` 旧代码请求 `/api/actors/market`（不存在，被 `[actorId]` 动态路由误命中 actorId=market）。修正为真实 `/api/actors/platform`（page/pageSize 分页），并映射 `{actors, total}` → `MarketActorCard[]`。

5. **导航解析器统一**：Dashboard、任务中心、KK 共用 `lib/client/v2/navigation/resolver.ts`，`isInternalAppRoute()` 只允许 `/` 开头同源路由，外部 URL 不传给 `router.push`（防开放重定向）。

## 禁止扩展（已遵守）

- ✅ 未在本阶段实现 Work Version、Conversation Ledger 或 Universe Manifest
- ✅ 未重做工作台内部编辑器
- ✅ 未新增社区推荐算法或演员交易规则
- ✅ 未用 demo Project/Job/Publication/Actor ID 掩盖数据缺失

## 下一步（Phase 1）

Phase 1 在 `storyflow_works` 上追加版本和会话关系，不重建 Work 身份。参考 `docs/kiikis-2.2/TRAE/01-Phase-1-Work身份会话版本与Evidence地基.md`。
