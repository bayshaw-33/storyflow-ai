# Kiikis 后台管理系统 — 第一期设计（P0 基础设施 + P1 用户管理 + P5 AI 指令编辑）

**日期**：2026-07-23
**项目**：storyflow-ai（kiikis.com）
**工作目录**：`/Volumes/Kiikis2026/storyflow-ai`
**范围**：第一期交付 RBAC 权限模型、Admin 布局骨架、用户管理、AI 指令编辑。后续 P2 运营看板 / P3 内容审核 / P4 系统监控在后续期独立交付。

---

## 背景

kiikis.com 当前已有成熟的 Next.js 应用与完整 Supabase 后端，但后台仅有 `/admin` 一个只读用户列表页，靠 `ADMIN_EMAIL` 环境变量做硬门禁。用户（项目所有者）希望搭建一套可视化的后台管理系统，最终覆盖：用户管理、内容审核、运营数据看板、系统与任务监控、AI 顶层指令编辑，并需要分角色 RBAC。

经分期评估，第一期交付 **P0 基础设施 + P1 用户管理 + P5 AI 指令编辑**。选 P5 并入第一期是因为用户两次强调该需求，优先级高；AI 指令中枢 `lib/ai/prompts.ts` 结构清晰（4 套 rules + 41 个 taskType + `buildPrompt()`），可控。

### 技术路线

方案 A：扩展现有 Next.js `/admin`，复用 Supabase auth / service_role / i18n / kiikis 设计语言。已选定。

### 现状关键文件

- `app/admin/page.tsx`：现有只读用户列表（将升级改造）
- `app/admin/users/route.ts`：现有用户列表 API（靠 `ADMIN_EMAIL` 硬门禁 + service_role）
- `lib/supabase/server.ts`：`authenticateRequest` / `serviceFetch` / `getCreditAccount` 等服务端 helper
- `lib/ai/prompts.ts`：AI 指令中枢，4 套 rules + `promptByTask`(41) + `buildPrompt()`
- `supabase/migrations/20260716000000_baseline.sql`：`storyflow_profiles`、`storyflow_credits` 表定义
- `components/layout/GlobalSideNav.tsx`：站点导航（admin 侧栏将复用设计语言）
- 无 `middleware.ts`（auth 在 route 层做）

### 现有表结构（已确认）

```sql
storyflow_profiles(user_id, email, display_name, plan DEFAULT 'free', created_at, updated_at, universe_engine_override DEFAULT false)
storyflow_credits(user_id PK, monthly_limit DEFAULT 100, balance DEFAULT 100, period_start, period_end, updated_at)
storyflow_team_members(id, team_id, user_id, role CHECK IN ('owner','admin','editor','viewer'), status CHECK IN ('active','invited','removed'))
```

无 admin 角色表、无封禁字段（封禁走 Supabase Auth Admin API 的 `banned_until`）。

---

## §1 架构与 RBAC 权限模型

### 新增表（一个 migration）

**`storyflow_admin_roles`**

| 列 | 类型 | 说明 |
|---|---|---|
| `user_id` | uuid PK, FK→auth.users ON DELETE CASCADE | 管理员用户 |
| `role` | text CHECK IN (`super_admin`,`operator`,`viewer`) | 角色 |
| `created_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | |
| `updated_by` | uuid | 操作人 user_id |

**`storyflow_admin_audit_log`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK DEFAULT gen_random_uuid() | |
| `admin_user_id` | uuid | 操作人 |
| `action` | text | 如 `user.credits.adjust` / `ai_prompt.update` |
| `target_user_id` | uuid nullable | 被操作用户（用户管理类操作） |
| `target_ref` | text nullable | 被操作对象引用（如 `prompt:rules:common`） |
| `payload` | jsonb | 变更前后快照 |
| `created_at` | timestamptz DEFAULT now() | |

RLS：`super_admin` 全表读写；`operator` 只能读自己产生的日志；`viewer` 不可见。通过 `auth.uid()` JOIN `storyflow_admin_roles` 判定。

### 角色权限矩阵

| 能力 | super_admin | operator | viewer |
|---|---|---|---|
| 查看用户/数据/AI 指令 | ✓ | ✓ | ✓ |
| 调整积分/套餐/封禁 | ✓ | ✓ | ✗ |
| 编辑 AI 指令/注入/回滚 | ✓ | ✓ | ✗ |
| 管理其他管理员角色 | ✓ | ✗ | ✗ |
| 查看审计日志 | ✓ | ✗ | ✗ |

### 门禁迁移

现有 `ADMIN_EMAIL` 硬门禁 → 查 `storyflow_admin_roles` 表。`ADMIN_EMAIL` 保留为**初始化种子**：migration 执行时把该邮箱对应的 user_id 自动写入 `super_admin`；之后以表为准。`app/admin/users/route.ts` 现有逻辑保留兼容（查询时同时检查表）。

新增 helper `requireAdminRole(request, minRole): Promise<AuthenticatedUser & { role: AdminRole }>`，所有 `/admin/api/*` 路由前置调用。角色等级：`super_admin` > `operator` > `viewer`。

---

## §2 Admin 布局骨架与路由

### 新建 `app/admin/layout.tsx`

- 左侧栏：导航项（按当前用户角色动态过滤）
- 顶栏：当前管理员 email + 角色徽标 + 登出
- 主内容区：children
- 复用 `kiikis-dashboard-shell` 设计语言，深色系与主站一致

### 路由结构

| 路由 | 说明 | 最低角色 |
|---|---|---|
| `/admin` | 概览页（基础卡片：用户总数、今日新增、生成任务数等，P2 看板预留占位） | viewer |
| `/admin/users` | 用户列表 | viewer |
| `/admin/users/[userId]` | 用户详情与操作 | viewer（写操作 operator+） |
| `/admin/ai-prompts` | AI 指令编辑（三 tab：Rules / 任务指令 / 全局注入） | viewer（写操作 operator+） |
| `/admin/admins` | 管理员角色管理 | super_admin |
| `/admin/audit-log` | 审计日志 | super_admin |

侧栏导航项按角色过滤显示。后端模块（内容审核/系统监控）导航位预留但标注"即将上线"。

### 访问控制

`app/admin/layout.tsx` 客户端先拉 `/admin/api/me` 获取角色；无角色 → 跳 `/login`；有角色但访问超出权限的页面 → 显示「无权限」占位。每个写操作 API 在服务端 `requireAdminRole` 二次校验，前端隐藏只是 UX，不是安全边界。

---

## §3 用户管理功能

### 列表页 `/admin/users`

- 搜索：email / display_name 模糊（Supabase ilike）
- 筛选：套餐（free/business/...）、状态（正常/已封禁）
- 分页：每页 50，Supabase range 分页
- 列：邮箱、名称、注册时间、套餐、积分余额、账号状态
- 现有 `app/admin/page.tsx` 升级为这个列表（改造，不新建第二份）

### 详情页 `/admin/users/[userId]`

- **基本信息**：email、display_name（可编辑）、注册时间、最近登录
- **积分账户**：balance / monthly_limit / 周期起止，可「充值 / 扣减 / 重置至 monthly_limit」
- **套餐**：plan 可改（free / business / ...）
- **账号状态**：封禁（调 Supabase Auth Admin API 设 `banned_until`）/ 解封
- **最近活动**：该用户最近的生成任务（读 `storyflow_generation_tasks`，limit 20）

所有写操作：二次确认 modal → 调 API → 成功后刷新 → 写审计日志。危险操作（封禁/扣减）二次确认 modal 带输入校验（如重输用户邮箱确认）。

---

## §4 数据流与 API

统一前缀 `/admin/api/*`（与现有 `/admin/users` route 分开，避免混淆；现有 route 保留兼容期）。

### 用户管理

| Method | Path | 说明 | 最低角色 |
|---|---|---|---|
| GET | `/admin/api/me` | 当前管理员身份与角色 | viewer |
| GET | `/admin/api/users?q=&plan=&status=&page=&pageSize=` | 列表 | viewer |
| GET | `/admin/api/users/[userId]` | 详情（聚合 profile + credits + auth 元数据 + 最近任务） | viewer |
| PATCH | `/admin/api/users/[userId]` | 改 display_name / plan | operator |
| POST | `/admin/api/users/[userId]/credits` | 调整积分 `{delta}` 或 `{reset:true}` | operator |
| POST | `/admin/api/users/[userId]/ban` | 封禁 `{duration}` | operator |
| POST | `/admin/api/users/[userId]/unban` | 解封 | operator |

### 管理员角色

| Method | Path | 说明 | 最低角色 |
|---|---|---|---|
| GET | `/admin/api/admins` | 管理员列表 | super_admin |
| POST | `/admin/api/admins` | 添加管理员 `{userId, role}` | super_admin |
| PATCH | `/admin/api/admins/[userId]` | 改角色 | super_admin |
| DELETE | `/admin/api/admins/[userId]` | 移除管理员 | super_admin |

### AI 指令

| Method | Path | 说明 | 最低角色 |
|---|---|---|---|
| GET | `/admin/api/ai-prompts` | 列出所有 rules + task 指令 | viewer |
| GET | `/admin/api/ai-prompts/[key]` | 单条详情 + 最近 N 个版本 | viewer |
| PATCH | `/admin/api/ai-prompts/[key]` | 更新 body | operator |
| POST | `/admin/api/ai-prompts/[key]/rollback` | 回滚到指定版本 | operator |
| GET | `/admin/api/ai-prompts/overrides` | 全局注入列表 | viewer |
| POST | `/admin/api/ai-prompts/overrides` | 新建注入 | operator |
| PATCH | `/admin/api/ai-prompts/overrides/[id]` | 改注入（含启停） | operator |
| DELETE | `/admin/api/ai-prompts/overrides/[id]` | 删除注入 | operator |
| POST | `/admin/api/ai-prompts/refresh-cache` | 编辑后刷新服务端缓存 | operator |

### 审计日志

| Method | Path | 说明 | 最低角色 |
|---|---|---|---|
| GET | `/admin/api/audit-log?action=&admin_id=&page=` | 日志列表 | super_admin |

### 调用链

前端带 Bearer token → route 调 `authenticateRequest` → `requireAdminRole(minRole)` → `serviceFetch`(service_role) 读写 → 写 `storyflow_admin_audit_log` → 返回。service_role key 永不离开服务端。

---

## §5 审计、错误处理、测试

### 审计

每个写操作（积分/套餐/封禁/角色变更/AI 指令编辑/注入管理/回滚）记录：
- `admin_user_id`（操作人）
- `action`（如 `user.credits.adjust`、`ai_prompt.update`、`ai_prompt.rollback`、`admin.role.add`）
- `target_user_id`（用户管理类）/ `target_ref`（AI 指令类，如 `prompt:rules:common`）
- `payload`：变更前后快照

super_admin 可在 `/admin/audit-log` 查看，支持按 action / admin_id 筛选 + 分页。

### 错误处理

- 401 未登录 → 跳 `/login`
- 403 无角色 / 权限不足 → 友好提示「无权限」
- API 失败 → inline 错误条 + toast
- 危险操作（封禁/扣减）→ 二次确认 modal（输入校验）

### 测试（沿用现有 `tests/*.test.mjs` 风格）

- **后端守卫**：无 token / 有 token 无角色 / viewer 调写接口 / operator 调 super_admin 接口
- **用户管理**：列表分页/搜索、积分调整（充值/扣减/重置）、封禁/解封流
- **AI 指令**：读取默认值、更新 body、回滚、注入 prepend/append 拼装位置
- **审计**：每次写操作产生一条日志，payload 含变更前后

### 迁移

`supabase/migrations/20260727000000_admin_rbac_and_user_management.sql`：
- 建 `storyflow_admin_roles`、`storyflow_admin_audit_log`、`storyflow_ai_prompts`、`storyflow_ai_prompt_versions`、`storyflow_ai_prompt_overrides`
- RLS 策略
- 种子 `ADMIN_EMAIL` → `super_admin`
- 种子 AI prompts：从 `lib/ai/prompts.ts` 的 4 套 rules + 41 个 `promptByTask` 导入初始值（key 命名：`rules:common` / `rules:song` / `rules:novel` / `rules:creation` / `task:<taskType>`）

---

## §6 AI 指令编辑

### 数据模型（并入同一 migration）

**`storyflow_ai_prompts`**

| 列 | 类型 | 说明 |
|---|---|---|
| `key` | text PK | 如 `rules:common` / `task:brief` |
| `category` | text CHECK IN (`rules`,`task`) | 分类 |
| `label` | text | 中文名（如「通用规则」「创意 Brief」） |
| `body` | text | 指令正文 |
| `updated_at` | timestamptz DEFAULT now() | |
| `updated_by` | uuid | |

种子 45 条（4 rules + 41 task）。

**`storyflow_ai_prompt_versions`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `prompt_key` | text FK→storyflow_ai_prompts.key | |
| `body` | text | 该版本正文 |
| `updated_by` | uuid | |
| `created_at` | timestamptz DEFAULT now() | |

每次 PATCH 在 versions 表插入一条历史。

**`storyflow_ai_prompt_overrides`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `scope` | text CHECK IN (`global`,`task_type`) | 作用范围 |
| `target` | text | `*` 或具体 taskType | 
| `injection_text` | text | 注入片段 |
| `position` | text CHECK IN (`prepend`,`append`) | 拼装位置 |
| `enabled` | boolean DEFAULT true | |
| `updated_at` | timestamptz DEFAULT now() | |
| `updated_by` | uuid | |

### 改造 `lib/ai/prompts.ts`

- 新增 `loadPromptsFromDb()`：服务端从 DB 读 rules + promptByTask，进程内缓存
- `buildPrompt()` 改为 async：优先用 DB 缓存值，DB 无值回退代码里的默认值（保证迁移期零风险）
- 在 `buildPrompt()` 拼装时，按 `overrides` 表把 `injection_text` 拼到 prepend/append 位置
  - `global` scope 对所有 taskType 生效
  - `task_type` scope 仅对指定 taskType 生效
  - 多条注入按 `created_at` 顺序拼接
- 新增 `refreshPromptCache()`：编辑后调用，清缓存重载

**兼容性**：`buildPrompt()` 改 async 后，所有调用点（`lib/ai/generate.ts`、`app/api/ai/generate/route.ts` 等）相应加 `await`。迁移期 DB 为空时完全回退到代码默认值，零风险。

### 后台 UI `/admin/ai-prompts`

三个 tab：

1. **顶层 Rules**：4 套（common/song/novel/creation），列表 + 编辑器
2. **任务指令**：41 个 taskType，按工作台分组（script/novel/song/viral/creation），列表 + 编辑器
3. **全局注入**：overrides 列表 + 新建/编辑/启停/删除

编辑器布局：
- 左侧：分组列表（可搜索）
- 右侧：等宽字体 textarea + 保存 / 重置默认 / 查看版本历史
- 版本历史：diff 视图（当前 vs 历史版本）+ 一键回滚
- 顶部红色警示条：「修改将影响所有用户的 AI 生成质量」
- 保存二次确认

全局注入编辑：
- 作用范围选择（全局 / 特定 taskType 下拉）
- 位置选择（prepend 前置 / append 后置）
- 注入片段 textarea
- 启停开关

### 权限

编辑（保存/回滚/注入管理）需 `operator`+，`viewer` 只读。所有写操作进审计日志。

### 安全

- prompt 改动影响所有用户生成质量，编辑页顶部红色警示条 + 保存二次确认
- 默认显示"上次生效版本"对比（diff 高亮）
- `buildPrompt()` 失败回退代码默认值，不影响生成
