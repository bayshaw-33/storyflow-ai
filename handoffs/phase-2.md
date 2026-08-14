# Phase 2 Handoff：Universe 原生继承与统一 Shell

> 分支：`feat/K22-P2-universe-inheritance`
> 基线：`origin/main` @ `ba35dc14`（Phase 1 合并后）
> 契约版本：`2.2.0-alpha.1`（兼容 `2.0.0-alpha.1`）
> 交付日期：2026-08-14

## Goal

把 Universe 从"V2 概览页只读聚合"升级为"原生继承事实源"：Universe 拥有基于内容哈希的不可变版本；每个 Work 通过 `InheritanceManifestV1` 原子绑定到某个 Universe 版本；Context Packet 为下游 AI 提供高信号、来源可见的上下文包；Universe 更新时计算对象级 Diff 并支持逐项采用；所有工作台通过统一 Shell 常驻 Universe 状态与绑定入口。

## Gate 2 验收

| 验收项 | 状态 | 证据 |
|--------|------|------|
| 相同 Canon 对象集 + 版本顺序 → 相同 contentHash | ✅ | `tests/contracts-v22/universe-inheritance.test.mjs` |
| 任何对象版本变化 → 不同 contentHash；时间戳/输入顺序不影响 | ✅ | 同上 — determinism + stability 测试 |
| Work 绑定 Universe 原子（manifest + snapshot 同事务） | ✅ | `tests/server-v2/inheritance/inheritance-v22.test.mjs` |
| Context Packet 固定输入 → 固定引用顺序 + 来源可见 | ✅ | `tests/server-v2/context-packets/context-packets.test.mjs` |
| Universe 更新 Diff 对象级 + 逐项采用幂等 | ✅ | `tests/server-v2/inheritance/inheritance-diff.test.mjs` |
| 所有工作台常驻 Universe 状态 + 绑定入口 | ✅ | `tests/ui-v2/workbench-shell/workbench-shell.test.mjs` + `tests/ui-v2/universe/universe.test.mjs` |
| 契约模块可被客户端 bundle 安全导入（无 `node:crypto`） | ✅ | `pnpm build` 成功；hash 拆分到 server-only 文件 |
| tsc 0 错误 + 全量 build 通过 | ✅ | `npx tsc --noEmit` + `pnpm build` |

## 验证结果

- **Node 测试**：Phase 2 相关 212 个测试全过（contracts-v22 + server-v2/inheritance + server-v2/universe-read + server-v2/context-packets + server-v2/proposals + ui-v2/universe + ui-v2/workbench-shell）
- **TypeScript**：`npx tsc --noEmit` 0 错误
- **Build**：`pnpm build` 成功，全部路由正常生成
- 全量回归中 18 个失败均为 pre-existing 环境问题（`next/headers` ESM 解析 + Phase 0/1 遗留的 `TASK_EVENT_TYPES` 导出），与 Phase 2 无关

## 交付内容

### Task 2.1：Universe Version 与 Manifest 契约

**Commit:** `70698761` — `test(v2.2): define universe inheritance contracts`

- `lib/contracts/v2/universe-inheritance-v22.ts` — `UniverseVersionV22`、`InheritanceManifestV1` 类型；`WORK_RELATIONS`（6 种）、`CANON_POLICIES`（3 种）枚举；`isWorkRelation`/`isCanonPolicy` type guards；`assertUniverseVersionV22`/`assertInheritanceManifestV1` validators；`UniverseInheritanceContractError`
- `lib/contracts/v2/universe-inheritance-v22-hash.ts` — `computeUniverseVersionContentHash`（server-only，依赖 `node:crypto`）
- `tests/contracts-v22/universe-inheritance.test.mjs` — 契约验证（determinism、stability、content sensitivity、parser 拒绝非法输入）

关键约束：
- contentHash 只由 `id` + `versionId` + `content` 计算，排除 `updatedAt` 等非内容元数据
- 对象按 type 分组，组内按 `id` 稳定排序，组间按 `CANON_TYPE_ORDER` 拼接
- **架构决策**：hash 函数拆分到独立 server-only 文件，避免 `node:crypto` 经客户端组件链路污染 bundle

### Task 2.2：数据库地基与原子绑定

**Commit:** `79b8c81f` — `feat(v2.2): version universe canon by content hash`

- `supabase/migrations/20260828020000_K22-P2_universe_inheritance.sql` — `storyflow_universe_versions`、`storyflow_work_inheritance_manifests` 表；RPC `bind_work_to_universe_v22`（原子绑定 + snapshot）、`read_work_inheritance_v22`、`compute_inheritance_diff_v22`、`adopt_inheritance_diffs_v22`；唯一约束（universe_id+version_no、universe_id+content_hash）
- `lib/server/v2/inheritance/index.ts` — `bindWorkToUniverseV22`、`readWorkInheritanceV22` 服务层
- `app/api/v2/works/[workId]/universe/bind/route.ts` — POST 绑定
- `app/api/v2/works/[workId]/inheritance/route.ts` — GET 读取继承状态
- `tests/server-v2/inheritance/inheritance-v22.test.mjs` — 绑定原子性、权限、stale 检测

关键约束：
- 绑定是 append-only：新 manifest supersede 旧 manifest（`is_active=false`，`superseded_by` 指向新）
- content_hash 唯一约束保证相同内容不重复建版本
- 调用者必须是 Work 和 Universe 的 owner

### Task 2.3：Context Packet 服务

**Commit:** `4ad8d08e` — `feat(v2.2): add context packets and universe diff/adopt`

- `lib/server/v2/context-packets/index.ts` — `fetchContextPacket`：高信号组包（当前场景角色/地点优先 → 时间线邻近事件 → 关联对象 → canon 默认）；字节预算控制；固定输入 → 固定引用顺序
- `lib/server/v2/context-packets/ranking.ts` — 相关性评分
- `app/api/v2/works/[workId]/context-packet/route.ts` — GET 上下文包
- `tests/server-v2/context-packets/context-packets.test.mjs` — 确定性、预算、来源可见

关键约束：
- 每个 reference 带 `reason`（selected/timeline_adjacent/related/canon_default）+ `relevanceScore`，来源可见
- 固定输入（Work 快照 + Universe 版本）→ 固定引用顺序，满足确定性
- 字节预算 `budgetBytes` 超限时按 relevanceScore 降序裁剪

### Task 2.4：Universe 更新 Diff 与逐项采用

**Commit:** `4ad8d08e` — `feat(v2.2): add context packets and universe diff/adopt`

- `lib/server/v2/inheritance/diff.ts` — `computeInheritanceDiff`（对象级差异：added/changed/deprecated/conflict）、`adoptInheritanceDiffs`（逐项采用，生成新 manifest + checkpoint）
- `app/api/v2/works/[workId]/inheritance/diff/route.ts` — GET Diff
- `app/api/v2/works/[workId]/inheritance/adopt/route.ts` — POST 逐项采用
- `tests/server-v2/inheritance/inheritance-diff.test.mjs` — Diff 计算、采用幂等、stale 状态转换
- `tests/server-v2/proposals/proposals.test.mjs` — Change Proposal 集成

关键约束：
- Diff 只比较 manifest 绑定的 universeVersionId 与 latestUniverseVersionId 之间的对象
- 采用是幂等的：相同 diffIds 重复采用返回 `idempotent=true`，不创建新 manifest
- 采用后 manifest 的 universeVersionId 推进到 latest，stale 标志清除

### Task 2.5：所有工作台的 Universe 常驻动作

**Commit:** 本 handoff 提交 — `feat(v2.2): universe status and binding in workbench shell`

- `components/v2/workbench-shell/UniverseStatus.tsx` — 绑定状态显示（bound 名称+版本+关系 / standalone 创建/绑定入口 / stale badge + 同步入口）
- `components/v2/workbench-shell/UniverseBindingDialog.tsx` — 绑定对话框（选择 Universe + 关系 + 策略 + timeline anchor + included IDs）
- `components/v2/workbench-shell/TopBar.tsx` — 用 `UniverseStatus` 替换原简单 badge
- `components/v2/workbench-shell/WorkbenchShell.tsx` — 集成 `UniverseBindingDialog`，binding adapter 注入
- `components/v2/universe/WorksPanel.tsx` — 从 Universe 创建 Work 入口（选择 Work 类型 + 关系）
- `lib/client/v2/universe/types.ts` — V22 客户端 DTO（`WorkInheritanceStateV22`、`InheritanceDiffResultV22`、`ContextPacketV22` 等）
- `lib/client/v2/universe/api.ts` — 客户端 API 封装（bind/read/diff/adopt/context-packet）
- `lib/client/v2/workbench/types.ts` — `UniverseBindingAdapter` 扩展
- `tests/ui-v2/workbench-shell/workbench-shell.test.mjs` — standalone/bound/stale 三态渲染 + 绑定入口可用性
- `tests/ui-v2/universe/universe.test.mjs` — V22 枚举一致性 + 组件存在性 + WorksPanel 创建入口
- `e2e/v22-universe-inheritance.spec.ts` — E2E：绑定 → stale → diff → adopt 全流程

关键约束：
- 无 workId 时绑定入口禁用（不本地假绑定）
- standalone Work 显示"创建 Universe"和"绑定已有 Universe"两个入口
- stale 时显示同步入口；非 stale 时同步禁用
- `UniverseBindingDialog` 默认不自动弹窗（`bindingDialogOpen` 初始 false）

## 关键架构决策

1. **Hash 函数拆分**：`computeUniverseVersionContentHash` 从 contracts 主文件拆到 `universe-inheritance-v22-hash.ts`，因为客户端组件（经 `lib/client/v2/universe/types.ts`）需要 import `WORK_RELATIONS`/`CANON_POLICIES` 运行时常量，若 contracts 主文件静态依赖 `node:crypto`，webpack build 会失败。拆分后 contracts 主文件纯类型+常量+验证器，客户端可安全导入；hash 函数只在服务端/测试中使用。

2. **原子绑定 RPC**：`bind_work_to_universe_v22` 在单个事务内完成"创建/复用 Universe Version + 创建 Inheritance Manifest + 创建 Work Snapshot"，避免中间态。

3. **content_hash 唯一约束**：相同 Canon 对象集 → 相同 hash → 复用 Universe Version，避免版本膨胀。

4. **Append-only manifest**：绑定是 append-only，旧 manifest 通过 `superseded_by` 链接，保证可追溯。

## 已知限制

- E2E spec 依赖真实 Work + Universe 存在，CI 环境需 fixture
- `next/headers` ESM 解析问题导致部分 pre-existing 测试在本地 Node runner 失败，Vercel build 不受影响
- Change Proposal 状态机集成在 Task 2.4 已覆盖，但 Inbox UI 渲染在 Phase 3+ 完善

## 下一步（Phase 3）

- 等 Phase 3 PRD 确认
- 验证 Vercel 部署：`/universes/[universeId]` 页面 + `/script-workbench?workId=...` 的 Universe 状态栏
- NAS 可用时 `git pull origin main` 同步代码 + `.env.local`
