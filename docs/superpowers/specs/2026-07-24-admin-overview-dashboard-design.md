# 后台运营看板设计（Admin Overview Dashboard）

- **日期**：2026-07-24
- **范围**：后台管理系统第二期 — 概览页运营看板落地
- **前置**：第一期（Task 1-20）已完成；RBAC、审计、AI 指令、用户管理均已上线
- **方案**：B 标准版 — 1 个聚合 API + 概览页重构 + recharts 趋势图

---

## 1. 目标

把当前"运营看板即将上线"占位页替换为有数据支撑的运营看板，覆盖用户、生成、额度、内容、管理 5 个模块。管理员登录后一眼看到平台核心运营指标与趋势。

**非目标**：内容审核页（`/admin/content`）、系统监控页（`/admin/monitor`）不在本期范围。

---

## 2. 权限模型

| 模块 | 最低角色 | 说明 |
|------|----------|------|
| 用户指标（总数/新增/趋势/套餐/封禁） | viewer | 与 `/admin/api/users` 一致 |
| 生成指标（任务数/成功率/类型分布/趋势） | viewer | 聚合数据，无敏感信息 |
| 额度指标（余额/水位/低额度用户数） | viewer | 聚合数据 |
| 内容指标（项目/剧集/场景/角色产出量） | viewer | 聚合数据 |
| 管理指标（管理员数/角色分布/审计条数/AI 指令数） | **super_admin** | 与现有 admins/audit-log API 一致 |

前端按角色条件渲染：viewer 看不到管理模块卡片，super_admin 看全部。API 侧 `requireAdminRole` 强制校验。

---

## 3. 数据来源

### 3.1 已有表（service role 直查）

| 指标 | 表 | 聚合方式 |
|------|----|----------|
| 用户总数 / 今日新增 / 7-30 天注册趋势 | `auth.users` | `count(*)` + `date_trunc('day', created_at)` 分组 |
| 套餐分布 | `storyflow_profiles.plan` | `group by plan` count |
| 封禁用户数 | `auth.users.banned_until` | `count(*) where banned_until > now()` |
| 文本生成任务总数 / 成功率 / 失败率 | `storyflow_generation_tasks` | `count(*)` + 按 status 分组 |
| 多媒体生成按类型分布 | `storyflow_generation_jobs` | `group by job_type` count |
| 7-30 天生成趋势 | `storyflow_generation_tasks.created_at` | `date_trunc('day', created_at)` 分组 |
| 全局余额总和 / 平均水位 | `storyflow_credits.balance` | `sum` / `avg` |
| 月度上限分布 | `storyflow_credits.monthly_limit` | `group by monthly_limit` count |
| 低额度用户数 | `storyflow_credits` | `count(*) where balance < monthly_limit * 0.1` |
| 项目总数 / 状态分布 | `storyflow_projects` | `count(*)` + `group by status`，过滤 `deleted_at IS NULL` |
| 剧集 / 场景 / 角色产出量 | `storyflow_episodes` / `storyflow_scenes` / `storyflow_characters` | `count(*)` |
| 管理员数 / 角色分布 | `storyflow_admin_roles` | `count(*)` + `group by role` |
| 审计日志近期条数（24h） | `storyflow_admin_audit_log` | `count(*) where created_at > now() - interval '24 hours'` |
| AI 指令数 / 最近更新时间 | `storyflow_ai_prompts` | `count(*)` + `max(updated_at)` |

### 3.2 不需要的指标

- `totalGenerations` 字段（现有 users route 硬编码 0）→ 由新 stats API 取代，概览页不再复用 users API
- Provider/Model 使用分布、成本估算、Token 消耗 → 延后到系统监控模块（方案 C）
- 导出量、团队/组织数 → 非核心，延后

---

## 4. API 设计

### `GET /admin/api/stats?range=7|30`

单一聚合端点，返回看板所需全部指标。`range` 控制趋势图天数（默认 7）。

**权限**：viewer+ 可读基础模块；管理模块字段仅 super_admin 可见（API 内部按角色条件返回）。

**响应结构**：

```typescript
type StatsResponse = {
  users: {
    total: number;
    newToday: number;
    banned: number;
    planDistribution: { plan: string; count: number }[];
    registrationTrend: { date: string; count: number }[]; // YYYY-MM-DD
  };
  generations: {
    textTotal: number;
    textCompleted: number;
    textFailed: number;
    successRate: number; // 0-100
    jobTypeDistribution: { jobType: string; count: number }[];
    generationTrend: { date: string; count: number }[];
  };
  credits: {
    totalBalance: number;
    avgBalance: number;
    lowBalanceUsers: number; // balance < monthly_limit * 0.1
    monthlyLimitDistribution: { monthlyLimit: number; count: number }[];
  };
  content: {
    projectsTotal: number;
    projectStatusDistribution: { status: string; count: number }[];
    episodes: number;
    scenes: number;
    characters: number;
  };
  // 以下仅 super_admin 可见，其他角色为 null
  admin?: {
    adminCount: number;
    roleDistribution: { role: string; count: number }[];
    auditLogLast24h: number;
    aiPromptsCount: number;
    aiPromptsLastUpdated: string | null; // ISO timestamp
  } | null;
};
```

**实现要点**：
- 使用 service role client（`createClient(url, serviceRoleKey)`）直查，绕过 RLS
- 并行发起多个 `Promise.all` 聚合查询，控制总延迟 < 1s
- `registrationTrend` / `generationTrend` 用 `date_trunc('day', created_at)` + `count(*)` 分组，补齐无数据的日期为 0
- 趋势查询用 `created_at >= now() - interval 'N days'` 过滤
- 低额度阈值：`balance < monthly_limit * 0.1`（用户确认）
- 错误隔离：单个模块查询失败返回该模块为 null，不阻断整体响应

---

## 5. 前端设计

### 5.1 页面结构

`app/admin/page.tsx` 重构为运营看板：

```
┌─────────────────────────────────────────────────┐
│ 概览                        [7天|30天] [刷新]    │
├─────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │用户   │ │今日   │ │封禁   │ │套餐   │  用户模块 │
│ │总数   │ │新增   │ │数     │ │分布   │            │
│ └──────┘ └──────┘ └──────┘ └──────┘            │
│ ┌─────────────────────────────────────┐         │
│ │ 注册趋势（折线图）                   │         │
│ └─────────────────────────────────────┘         │
├─────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐                      │
│ │文本   │ │成功   │ │失败   │  生成模块          │
│ │任务数 │ │率     │ │率     │                    │
│ └──────┘ └──────┘ └──────┘                      │
│ ┌─────────────────────────────────────┐         │
│ │ 生成趋势（折线图）                   │         │
│ └─────────────────────────────────────┘         │
│ ┌─────────────────────────────────────┐         │
│ │ 多媒体任务类型分布（柱状图）          │         │
│ └─────────────────────────────────────┘         │
├─────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐                      │
│ │全局   │ │平均   │ │低额度  │  额度模块          │
│ │余额   │ │水位   │ │用户数  │                    │
│ └──────┘ └──────┘ └──────┘                      │
│ ┌─────────────────────────────────────┐         │
│ │ 月度上限分布（柱状图）                │         │
│ └─────────────────────────────────────┘         │
├─────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │项目   │ │剧集   │ │场景   │ │角色   │  内容模块 │
│ │总数   │ │数     │ │数     │ │数     │            │
│ └──────┘ └──────┘ └──────┘ └──────┘            │
│ ┌─────────────────────────────────────┐         │
│ │ 项目状态分布（柱状图）                │         │
│ └─────────────────────────────────────┘         │
├─────────────────────────────────────────────────┤
│ [仅 super_admin 可见]                            │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │管理员 │ │角色   │ │24h    │ │AI指令 │  管理模块 │
│ │数     │ │分布   │ │审计数  │ │数/更新 │            │
│ └──────┘ └──────┘ └──────┘ └──────┘            │
└─────────────────────────────────────────────────┘
```

### 5.2 组件拆分

```
app/admin/page.tsx                    // 容器，拉数据 + range 切换 + 角色判断
app/admin/_components/
  ├── StatCard.tsx                    // 通用数字卡片（label + value + 可选子文案）
  ├── TrendChart.tsx                  // recharts 折线图（注册/生成趋势）
  ├── DistributionChart.tsx           // recharts 柱状图（套餐/类型/状态分布）
  ├── UsersSection.tsx                // 用户模块（4 卡片 + 趋势图）
  ├── GenerationsSection.tsx          // 生成模块（3 卡片 + 趋势图 + 类型分布）
  ├── CreditsSection.tsx              // 额度模块（3 卡片 + 上限分布）
  ├── ContentSection.tsx              // 内容模块（4 卡片 + 状态分布）
  └── AdminSection.tsx                // 管理模块（super_admin 独占，4 卡片）
```

### 5.3 recharts 集成

- `pnpm add recharts`
- 仅在 admin 页面使用，不影响主站包体积（Next.js 自动 code-split）
- 趋势图：`<LineChart>` + `<XAxis dataKey="date">` + `<YAxis>` + `<Tooltip>`
- 分布图：`<BarChart>` + `<XAxis dataKey="plan|jobType|status|role">`
- 主题：深色背景，网格线 `rgba(255,255,255,0.1)`，文字 `rgba(255,255,255,0.7)`
- 响应式：`<ResponsiveContainer width="100%" height={200}>`

### 5.4 交互

- **range 切换**：顶部 `[7天 | 30天]` 切换按钮，切换时重新 fetch `/admin/api/stats?range=N`
- **刷新**：手动刷新按钮（不自动轮询，避免 service role 查询压力）
- **加载态**：骨架屏（skeleton），不复用现有 loading 文案
- **错误态**：单个模块查询失败时该模块显示"数据加载失败"，不影响其他模块
- **空态**：趋势图无数据时显示"暂无数据"占位

---

## 6. 文案扩展

`lib/admin/zh.ts` 新增 `overview` 字段扩展：

```typescript
overview: {
  title: "概览",
  comingSoon: "运营看板即将上线", // 保留，备用
  range7days: "7天",
  range30days: "30天",
  refresh: "刷新",
  // 用户模块
  totalUsers: "用户总数",
  newUsersToday: "今日新增",
  bannedUsers: "封禁用户",
  planDistribution: "套餐分布",
  registrationTrend: "注册趋势",
  // 生成模块
  textTasksTotal: "文本任务总数",
  successRate: "成功率",
  failureRate: "失败率",
  generationTrend: "生成趋势",
  jobTypeDistribution: "多媒体任务分布",
  // 额度模块
  totalBalance: "全局余额",
  avgBalance: "平均水位",
  lowBalanceUsers: "低额度用户",
  monthlyLimitDistribution: "月度上限分布",
  // 内容模块
  projectsTotal: "项目总数",
  episodesTotal: "剧集数",
  scenesTotal: "场景数",
  charactersTotal: "角色数",
  projectStatusDistribution: "项目状态分布",
  // 管理模块
  adminCount: "管理员数",
  roleDistribution: "角色分布",
  auditLogLast24h: "24h 审计条数",
  aiPromptsCount: "AI 指令数",
  aiPromptsLastUpdated: "最近更新",
  // 状态
  loadFailed: "数据加载失败",
  noData: "暂无数据",
},
```

---

## 7. 测试

### 7.1 API 测试

`tests/admin-stats.test.mjs`：
- 无 token → 401
- viewer 可读 users/generations/credits/content，`admin` 字段为 null
- super_admin 可读 admin 字段
- range 参数校验（7/30 默认 7，非法值回退 7）

### 7.2 前端验证

手动验证（无自动化）：
- viewer 登录看不到管理模块
- super_admin 登录看到全部 5 模块
- 7/30 天切换趋势图变化
- 刷新按钮重新拉取
- 单模块失败不阻断其他模块

---

## 8. 性能考量

- **聚合查询**：`storyflow_generation_tasks` 可能数据量大，`date_trunc + count` 需确认索引。`20260725000000_performance_indexes.sql` 已存在，但需验证 `created_at` 复合索引覆盖趋势查询
- **并行查询**：`Promise.all` 并行发起 5 模块查询，总延迟 = max(单模块延迟)
- **无缓存**：首期不缓存，每次请求实时查询。若性能不达标，二期加 60s 内存缓存
- **趋势查询优化**：`created_at >= now() - interval '30 days'` 过滤后再分组，避免全表扫描

---

## 9. 实施顺序（writing-plans 细化）

1. 安装 recharts + 扩展 zh.ts 文案
2. 实现 `/admin/api/stats` 聚合 API（含权限分层）
3. 实现 StatCard / TrendChart / DistributionChart 通用组件
4. 实现 5 个 Section 组件
5. 重构 `app/admin/page.tsx` 组装看板
6. 写 `tests/admin-stats.test.mjs`
7. tsc + build 验证 + commit + push
8. Vercel 部署验证

---

## 10. 风险

| 风险 | 缓解 |
|------|------|
| `generation_tasks` 表无 `created_at` 索引，趋势查询慢 | 实施前先 `EXPLAIN` 验证；必要时补索引迁移 |
| recharts 包体积影响 admin 页加载 | Next.js code-split，仅 admin 路由加载 recharts |
| service role 查询压力大 | 首期无缓存，监控延迟；必要时加 60s 缓存 |
| `auth.users` 无法直接 SQL 查询 | 用 Supabase admin API（`auth.admin.listUsers`）或 service role RPC |
