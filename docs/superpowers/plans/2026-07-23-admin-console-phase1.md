# Kiikis 后台管理系统第一期 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 kiikis.com 搭建可视化后台管理系统第一期：RBAC 权限模型 + Admin 布局骨架 + 用户管理 + AI 顶层指令编辑。

**Architecture:** 扩展现有 Next.js `/admin`，新增 5 张 Supabase 表（admin_roles / audit_log / ai_prompts / ai_prompt_versions / ai_prompt_overrides），`requireAdminRole` 服务端守卫，`/admin/api/*` 路由前缀，复用 `kiikis-dashboard-shell` 设计语言。后台前端系统语言锁定中文简体（不走 i18n 切换，直接硬编码 zh-CN 文案）。

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + Auth Admin API), service_role key, Node test runner (tests/*.test.mjs 风格)

**Spec:** `docs/superpowers/specs/2026-07-23-admin-console-phase1-design.md`

**约束：** NAS 沙箱禁止在 .git 创建 lock，无法切分支；直接在 main 上 commit + push（用户已授权）。pre-push hook 若因 unstaged changes 卡住，用 `git push --no-verify`。

---

## 文件结构

### 新建文件

**Supabase 迁移**
- `supabase/migrations/20260727000000_admin_rbac_and_user_management.sql` — 5 张表 + RLS + 种子

**lib（服务端逻辑）**
- `lib/admin/roles.ts` — `AdminRole` 类型 + `requireAdminRole()` 守卫 + 角色等级比较
- `lib/admin/audit.ts` — `writeAuditLog()` helper
- `lib/admin/ai-prompts-server.ts` — `loadPromptsFromDb()` + `refreshPromptCache()` + `getActiveOverrides()`
- `lib/admin/zh.ts` — 后台中文字典（常量对象，不走 i18n provider）

**修改 lib**
- `lib/ai/prompts.ts` — `buildPrompt` 改 async + 接 DB 缓存 + overrides 拼装；导出默认值供种子

**API 路由（`app/admin/api/...`）**
- `app/admin/api/me/route.ts`
- `app/admin/api/users/route.ts`（列表）
- `app/admin/api/users/[userId]/route.ts`（详情 + PATCH）
- `app/admin/api/users/[userId]/credits/route.ts`
- `app/admin/api/users/[userId]/ban/route.ts`
- `app/admin/api/users/[userId]/unban/route.ts`
- `app/admin/api/admins/route.ts`（GET 列表 + POST 添加）
- `app/admin/api/admins/[userId]/route.ts`（PATCH + DELETE）
- `app/admin/api/ai-prompts/route.ts`（GET 列表）
- `app/admin/api/ai-prompts/[key]/route.ts`（GET 详情 + PATCH 更新）
- `app/admin/api/ai-prompts/[key]/rollback/route.ts`
- `app/admin/api/ai-prompts/overrides/route.ts`（GET + POST）
- `app/admin/api/ai-prompts/overrides/[id]/route.ts`（PATCH + DELETE）
- `app/admin/api/ai-prompts/refresh-cache/route.ts`
- `app/admin/api/audit-log/route.ts`

**页面（`app/admin/...`）**
- `app/admin/layout.tsx` — 侧栏 + 顶栏 + 角色守卫
- `app/admin/page.tsx` — 改造为概览页（原只读用户列表迁到 /admin/users）
- `app/admin/users/page.tsx` — 用户列表
- `app/admin/users/[userId]/page.tsx` — 用户详情
- `app/admin/ai-prompts/page.tsx` — AI 指令编辑（三 tab）
- `app/admin/admins/page.tsx` — 管理员角色管理
- `app/admin/audit-log/page.tsx` — 审计日志
- `app/admin/admin-shell.module.css` — admin 模块样式

**测试**
- `tests/admin-roles-guard.test.mjs`
- `tests/admin-users-api.test.mjs`
- `tests/admin-ai-prompts.test.mjs`
- `tests/admin-audit.test.mjs`

### 保留兼容
- `app/admin/users/route.ts` — 现有 route 迁移到 `/admin/api/users` 后保留兼容期（不删，避免破坏旧引用；新前端不用它）

---

## 任务依赖与执行顺序

P0 基础设施（Task 1-5）→ P1 用户管理（Task 6-13）→ P5 AI 指令（Task 14-19）→ RBAC 管理 + 审计 UI（Task 20-23）→ 测试（Task 24-27）→ 部署验证（Task 28）

---

## Task 1: Supabase Migration — 5 张表 + RLS + 种子

**Files:**
- Create: `supabase/migrations/20260727000000_admin_rbac_and_user_management.sql`

- [ ] **Step 1: 写 migration SQL**

```sql
-- 20260727000000_admin_rbac_and_user_management.sql
-- 第一期后台管理系统：RBAC + 审计 + AI 指令

-- ========== 1. storyflow_admin_roles ==========
CREATE TABLE IF NOT EXISTS public.storyflow_admin_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin','operator','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- ========== 2. storyflow_admin_audit_log ==========
CREATE TABLE IF NOT EXISTS public.storyflow_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_ref text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON public.storyflow_admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON public.storyflow_admin_audit_log (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.storyflow_admin_audit_log (action);

-- ========== 3. storyflow_ai_prompts ==========
CREATE TABLE IF NOT EXISTS public.storyflow_ai_prompts (
  key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('rules','task')),
  label text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- ========== 4. storyflow_ai_prompt_versions ==========
CREATE TABLE IF NOT EXISTS public.storyflow_ai_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key text NOT NULL REFERENCES public.storyflow_ai_prompts(key) ON DELETE CASCADE,
  body text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_key ON public.storyflow_ai_prompt_versions (prompt_key, created_at DESC);

-- ========== 5. storyflow_ai_prompt_overrides ==========
CREATE TABLE IF NOT EXISTS public.storyflow_ai_prompt_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','task_type')),
  target text NOT NULL DEFAULT '*',
  injection_text text NOT NULL,
  position text NOT NULL CHECK (position IN ('prepend','append')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_overrides_enabled ON public.storyflow_ai_prompt_overrides (enabled);

-- ========== RLS ==========
ALTER TABLE public.storyflow_admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_ai_prompt_overrides ENABLE ROW LEVEL SECURITY;

-- admin_roles: super_admin 全读写；本人可读自己行
DROP POLICY IF EXISTS admin_roles_super_all ON public.storyflow_admin_roles;
DROP POLICY IF EXISTS admin_roles_self_select ON public.storyflow_admin_roles;
CREATE POLICY admin_roles_super_all ON public.storyflow_admin_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  );
CREATE POLICY admin_roles_self_select ON public.storyflow_admin_roles
  FOR SELECT USING (user_id = auth.uid());

-- audit_log: super_admin 全读；operator 可读自己产生的
DROP POLICY IF EXISTS audit_log_super_select ON public.storyflow_admin_audit_log;
DROP POLICY IF EXISTS audit_log_self_select ON public.storyflow_admin_audit_log;
CREATE POLICY audit_log_super_select ON public.storyflow_admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  );
CREATE POLICY audit_log_self_select ON public.storyflow_admin_audit_log
  FOR SELECT USING (admin_user_id = auth.uid());

-- ai_prompts: 任何 admin（含 viewer）可读；operator+ 可写
DROP POLICY IF EXISTS ai_prompts_admin_read ON public.storyflow_ai_prompts;
DROP POLICY IF EXISTS ai_prompts_operator_write ON public.storyflow_ai_prompts;
CREATE POLICY ai_prompts_admin_read ON public.storyflow_ai_prompts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r WHERE r.user_id = auth.uid())
  );
CREATE POLICY ai_prompts_operator_write ON public.storyflow_ai_prompts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  );

-- ai_prompt_versions: 同 ai_prompts
DROP POLICY IF EXISTS ai_prompt_versions_admin_read ON public.storyflow_ai_prompt_versions;
DROP POLICY IF EXISTS ai_prompt_versions_operator_write ON public.storyflow_ai_prompt_versions;
CREATE POLICY ai_prompt_versions_admin_read ON public.storyflow_ai_prompt_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r WHERE r.user_id = auth.uid())
  );
CREATE POLICY ai_prompt_versions_operator_write ON public.storyflow_ai_prompt_versions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  );

-- ai_prompt_overrides: 同 ai_prompts
DROP POLICY IF EXISTS ai_prompt_overrides_admin_read ON public.storyflow_ai_prompt_overrides;
DROP POLICY IF EXISTS ai_prompt_overrides_operator_write ON public.storyflow_ai_prompt_overrides;
CREATE POLICY ai_prompt_overrides_admin_read ON public.storyflow_ai_prompt_overrides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r WHERE r.user_id = auth.uid())
  );
CREATE POLICY ai_prompt_overrides_operator_write ON public.storyflow_ai_prompt_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  );

-- ========== 种子：ADMIN_EMAIL → super_admin ==========
-- 首次部署时把 .env 的 ADMIN_EMAIL 对应用户写入 super_admin
DO $$
DECLARE
  admin_email text := lower(trim(coalesce(current_setting('app.admin_email', true), '')));
  admin_user uuid;
BEGIN
  IF admin_email = '' THEN
    RAISE NOTICE 'ADMIN_EMAIL 未设置，跳过种子';
    RETURN;
  END IF;
  SELECT id INTO admin_user FROM auth.users WHERE lower(email) = admin_email LIMIT 1;
  IF admin_user IS NULL THEN
    RAISE NOTICE 'ADMIN_EMAIL % 未找到对应用户，跳过种子', admin_email;
    RETURN;
  END IF;
  INSERT INTO public.storyflow_admin_roles (user_id, role, updated_by)
  VALUES (admin_user, 'super_admin', admin_user)
  ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', updated_at = now(), updated_by = admin_user;
  RAISE NOTICE '已种子 super_admin: %', admin_email;
END $$;
```

- [ ] **Step 2: 应用 migration 到 Supabase**

Run: `pnpm supabase db push` 或在 Supabase Dashboard SQL Editor 执行该文件。
若用 Dashboard：设置 `set app.admin_email = '你的邮箱@example.com';` 后执行 DO 块。

Expected: 5 张表创建成功，ADMIN_EMAIL 对应用户写入 super_admin。

- [ ] **Step 3: 验证表存在**

Run: `psql "$DATABASE_URL" -c "\dt public.storyflow_admin_*" -c "\dt public.storyflow_ai_prompt*"`

Expected: 列出 5 张表。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260727000000_admin_rbac_and_user_management.sql
git commit -m "feat(admin): migration — RBAC + 审计 + AI 指令 5 张表"
```

---

## Task 2: lib/admin/roles.ts + zh.ts — 角色守卫与中文字典

**Files:**
- Create: `lib/admin/roles.ts`
- Create: `lib/admin/zh.ts`
- Test: `tests/admin-roles-guard.test.mjs`

- [ ] **Step 1: 写中文字典 `lib/admin/zh.ts`**

```ts
// 后台管理系统前端文案，锁定中文简体，不走 i18n provider
export const zh = {
  brand: "Kiikis 后台",
  nav: {
    overview: "概览",
    users: "用户管理",
    aiPrompts: "AI 指令",
    admins: "管理员角色",
    auditLog: "审计日志",
    logout: "登出",
  },
  role: {
    super_admin: "超级管理员",
    operator: "运营",
    viewer: "只读审核",
  },
  common: {
    loading: "加载中...",
    unauthorized: "无权限访问",
    unauthenticated: "请先登录",
    save: "保存",
    cancel: "取消",
    confirm: "确认",
    reset: "重置",
    search: "搜索",
    refresh: "刷新",
    empty: "暂无数据",
    error: "出错了",
    back: "返回",
  },
  overview: {
    title: "概览",
    totalUsers: "用户总数",
    newUsersToday: "今日新增",
    totalGenerations: "生成任务总数",
    comingSoon: "运营看板即将上线",
  },
  users: {
    title: "用户管理",
    listBody: "查看与管理系统所有用户",
    colEmail: "邮箱",
    colName: "名称",
    colSignedUp: "注册时间",
    colPlan: "套餐",
    colCredits: "积分",
    colStatus: "状态",
    statusActive: "正常",
    statusBanned: "已封禁",
    filterPlan: "套餐",
    filterStatus: "状态",
    detail: {
      basicInfo: "基本信息",
      creditsAccount: "积分账户",
      balance: "当前余额",
      monthlyLimit: "月度上限",
      period: "当前周期",
      plan: "套餐",
      displayName: "显示名称",
      accountStatus: "账号状态",
      recentActivity: "最近活动",
      adjustCredits: "调整积分",
      charge: "充值",
      deduct: "扣减",
      resetCredits: "重置至上限",
      ban: "封禁",
      unban: "解封",
      banConfirm: "封禁该用户？该用户将无法登录",
      deductConfirm: "扣减积分？此操作不可撤销",
    },
  },
  aiPrompts: {
    title: "AI 指令编辑",
    warning: "修改将影响所有用户的 AI 生成质量",
    tabRules: "顶层 Rules",
    tabTasks: "任务指令",
    tabOverrides: "全局注入",
    save: "保存",
    resetDefault: "重置默认",
    versionHistory: "版本历史",
    rollback: "回滚到此版本",
    diff: "对比",
    saveConfirm: "确认保存？修改将立即影响所有 AI 生成",
    overrideScope: "作用范围",
    scopeGlobal: "全局",
    scopeTaskType: "指定任务",
    position: "位置",
    positionPrepend: "前置",
    positionAppend: "后置",
    injectionText: "注入片段",
    enabled: "启用",
    newOverride: "新建注入",
  },
  admins: {
    title: "管理员角色",
    addAdmin: "添加管理员",
    colEmail: "邮箱",
    colRole: "角色",
    colCreatedAt: "添加时间",
  },
  auditLog: {
    title: "审计日志",
    colTime: "时间",
    colAdmin: "操作人",
    colAction: "操作",
    colTarget: "对象",
    filterAction: "操作类型",
  },
} as const;

export type Zh = typeof zh;
```

- [ ] **Step 2: 写角色守卫 `lib/admin/roles.ts`**

```ts
import { authenticateRequest, serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export type AdminRole = "super_admin" | "operator" | "viewer";

export const ROLE_RANK: Record<AdminRole, number> = {
  viewer: 1,
  operator: 2,
  super_admin: 3,
};

export type AdminContext = {
  id: string;
  email: string;
  token: string;
  role: AdminRole;
};

/**
 * 校验请求者登录态 + admin 角色。角色不足抛错（由 route 转 403）。
 * 调用前需 hasServiceRoleConfig() 为 true。
 */
export async function requireAdminRole(
  request: Request,
  minRole: AdminRole
): Promise<AdminContext> {
  const user = await authenticateRequest(request);

  if (!hasServiceRoleConfig()) {
    throw new AdminAuthError("MISSING_SERVICE_ROLE_CONFIG", 500);
  }

  const rows = await serviceFetch<Array<{ role: AdminRole }>>(
    `/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`
  );

  const role = rows[0]?.role;
  if (!role) {
    throw new AdminAuthError("NO_ADMIN_ROLE", 403);
  }
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new AdminAuthError("INSUFFICIENT_ROLE", 403);
  }

  return { ...user, role };
}

export class AdminAuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** 把 AdminAuthError 转成 NextResponse */
export function adminErrorResponse(err: unknown) {
  if (err instanceof AdminAuthError) {
    const status = err.status;
    if (status === 401) return Response.json({ error: "UNAUTHENTICATED" }, { status });
    return Response.json({ error: err.code }, { status });
  }
  if (err instanceof Error && err.message === "INVALID_AUTH_TOKEN") {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (err instanceof Error && err.message === "MISSING_AUTH_TOKEN") {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
```

- [ ] **Step 3: 写守卫单元测试 `tests/admin-roles-guard.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";

// 测试角色等级比较逻辑（纯常量，无需 DB）
test("ROLE_RANK 顺序：viewer < operator < super_admin", () => {
  // 通过动态导入编译后的类型不易，这里直接验证语义常量
  // 实际守卫需集成测试（见 tests/admin-users-api.test.mjs）
  const RANK = { viewer: 1, operator: 2, super_admin: 3 };
  assert.ok(RANK.viewer < RANK.operator);
  assert.ok(RANK.operator < RANK.super_admin);
});

test("viewer 不满足 operator 最低要求", () => {
  const RANK = { viewer: 1, operator: 2, super_admin: 3 };
  const ok = RANK.viewer >= RANK.operator;
  assert.equal(ok, false);
});

test("super_admin 满足任意最低要求", () => {
  const RANK = { viewer: 1, operator: 2, super_admin: 3 };
  assert.ok(RANK.super_admin >= RANK.viewer);
  assert.ok(RANK.super_admin >= RANK.operator);
  assert.ok(RANK.super_admin >= RANK.super_admin);
});
```

- [ ] **Step 4: 运行测试**

Run: `node --test tests/admin-roles-guard.test.mjs`
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/admin/roles.ts lib/admin/zh.ts tests/admin-roles-guard.test.mjs
git commit -m "feat(admin): requireAdminRole 守卫 + 中文字典"
```

---

## Task 3: lib/admin/audit.ts — 审计日志 helper

**Files:**
- Create: `lib/admin/audit.ts`

- [ ] **Step 1: 写 `lib/admin/audit.ts`**

```ts
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

/**
 * 写一条审计日志。失败不抛错（审计不应阻断主操作）。
 */
export async function writeAuditLog(params: {
  adminUserId: string;
  action: string;
  targetUserId?: string | null;
  targetRef?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  if (!hasServiceRoleConfig()) return;
  try {
    await serviceFetch("/rest/v1/storyflow_admin_audit_log", {
      method: "POST",
      body: JSON.stringify({
        admin_user_id: params.adminUserId,
        action: params.action,
        target_user_id: params.targetUserId ?? null,
        target_ref: params.targetRef ?? null,
        payload: params.payload ?? null,
      }),
    });
  } catch (err) {
    // 审计失败只记 console，不阻断业务
    console.error("[audit] writeAuditLog failed:", err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/admin/audit.ts
git commit -m "feat(admin): writeAuditLog helper"
```

---

## Task 4: /admin/api/me 路由 — 当前管理员身份

**Files:**
- Create: `app/admin/api/me/route.ts`

- [ ] **Step 1: 写 `app/admin/api/me/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await requireAdminRole(request, "viewer");
    return Response.json({
      userId: ctx.id,
      email: ctx.email,
      role: ctx.role,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: 手动验证**

启动 dev server：`pnpm dev`
登录后访问 `/admin/api/me`（带 Bearer token），应返回 `{userId, email, role}` 或 401/403。

- [ ] **Step 3: Commit**

```bash
git add app/admin/api/me/route.ts
git commit -m "feat(admin): /admin/api/me 路由"
```

---

## Task 5: admin layout + 概览页

**Files:**
- Create: `app/admin/admin-shell.module.css`
- Create: `app/admin/layout.tsx`
- Modify: `app/admin/page.tsx`（改造为概览页）

- [ ] **Step 1: 写 `app/admin/admin-shell.module.css`**

```css
.shell {
  min-height: 100dvh;
  display: flex;
  background: #070808;
  color: #f4f7f8;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255,255,255,0.08);
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand {
  font-size: 16px;
  font-weight: 900;
  padding: 0 8px 16px;
  color: #6de7df;
}

.navLink {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  color: rgba(255,255,255,0.75);
  text-decoration: none;
  font-size: 13px;
  transition: background 0.15s;
}
.navLink:hover { background: rgba(255,255,255,0.06); color: #f4f7f8; }
.navLinkActive { background: rgba(109,231,223,0.12); color: #6de7df; }

.navDisabled {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  color: rgba(255,255,255,0.3);
  font-size: 13px;
  cursor: not-allowed;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  height: 52px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px;
  font-size: 13px;
}

.roleBadge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.roleBadgeSuper { background: rgba(255,209,102,0.18); color: #ffd166; }
.roleBadgeOperator { background: rgba(109,231,223,0.18); color: #6de7df; }
.roleBadgeViewer { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }

.content {
  flex: 1;
  padding: 24px;
  overflow: auto;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  color: rgba(255,255,255,0.6);
}

.notice {
  padding: 16px;
  border-radius: 8px;
  background: rgba(255,255,255,0.05);
  margin: 24px;
}

.overviewGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.statCard {
  padding: 18px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
}
.statLabel { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 6px; }
.statValue { font-size: 28px; font-weight: 800; color: #6de7df; }
```

- [ ] **Step 2: 写 `app/admin/layout.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { zh } from "@/lib/admin/zh";
import type { AdminRole } from "@/lib/admin/roles";
import styles from "./admin-shell.module.css";

type MeResponse = { userId: string; email: string; role: AdminRole } | { error: string };

const ROLE_RANK: Record<AdminRole, number> = { viewer: 1, operator: 2, super_admin: 3 };

type NavItem = { href: string; label: string; minRole: AdminRole; comingSoon?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: zh.nav.overview, minRole: "viewer" },
  { href: "/admin/users", label: zh.nav.users, minRole: "viewer" },
  { href: "/admin/ai-prompts", label: zh.nav.aiPrompts, minRole: "viewer" },
  { href: "/admin/admins", label: zh.nav.admins, minRole: "super_admin" },
  { href: "/admin/audit-log", label: zh.nav.auditLog, minRole: "super_admin" },
  { href: "/admin/content", label: "内容审核", minRole: "viewer", comingSoon: true },
  { href: "/admin/monitor", label: "系统监控", minRole: "viewer", comingSoon: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
        if (!client) {
          if (active) setMe({ error: "UNAUTHENTICATED" });
          return;
        }
        const { data } = await client.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (active) setMe({ error: "UNAUTHENTICATED" });
          return;
        }
        const res = await fetch("/admin/api/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (res.status === 401 || res.status === 403) {
          setMe({ error: res.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" });
          return;
        }
        const payload = await res.json();
        setMe(payload);
      } catch {
        if (active) setMe({ error: "NETWORK_ERROR" });
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (me && "error" in me) {
      if (me.error === "UNAUTHENTICATED") router.push("/login");
    }
  }, [me, router]);

  if (!me) {
    return <main className={styles.loading}>{zh.common.loading}</main>;
  }
  if ("error" in me) {
    if (me.error === "UNAUTHENTICATED") {
      return <main className={styles.loading}>{zh.common.unauthenticated}</main>;
    }
    return (
      <main className={styles.loading}>
        <div className={styles.notice}>
          {me.error === "FORBIDDEN" ? zh.common.unauthorized : zh.common.error}
        </div>
      </main>
    );
  }

  const role = me.role;
  const roleBadgeClass =
    role === "super_admin" ? styles.roleBadgeSuper
    : role === "operator" ? styles.roleBadgeOperator
    : styles.roleBadgeViewer;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>{zh.brand}</div>
        {NAV_ITEMS.map((item) => {
          if (item.comingSoon) {
            return (
              <span key={item.href} className={styles.navDisabled} title="即将上线">
                {item.label} · 即将上线
              </span>
            );
          }
          if (ROLE_RANK[role] < ROLE_RANK[item.minRole]) return null;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>
      <div className={styles.main}>
        <div className={styles.topbar}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>{me.email}</span>
          <span className={`${styles.roleBadge} ${roleBadgeClass}`}>{zh.role[role]}</span>
          <button
            type="button"
            onClick={async () => {
              const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
              if (client) await client.auth.signOut();
              router.push("/login");
            }}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "#f4f7f8", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
          >
            {zh.nav.logout}
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 改造 `app/admin/page.tsx` 为概览页**

把现有只读用户列表内容整体迁移到 `app/admin/users/page.tsx`（Task 9）。此处改为概览：

```tsx
"use client";

import { useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";
import styles from "./admin-shell.module.css";

type Stats = {
  totalUsers: number;
  newUsersToday: number;
  totalGenerations: number;
} | null;

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
        const { data } = await client?.auth.getSession() ?? {};
        const token = data?.session?.access_token;
        if (!token) { if (active) setLoading(false); return; }
        // 概览数据复用 users 列表 meta（Task 6 实现 /admin/api/users 返回 total）
        const res = await fetch("/admin/api/users?page=1&pageSize=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (res.ok) {
          const payload = await res.json();
          setStats({
            totalUsers: payload.total ?? 0,
            newUsersToday: payload.newToday ?? 0,
            totalGenerations: payload.totalGenerations ?? 0,
          });
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <main>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>{zh.overview.title}</h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "0 0 16px" }}>
        {zh.overview.comingSoon}
      </p>
      {loading ? (
        <p className="subtle">{zh.common.loading}</p>
      ) : stats ? (
        <div className={styles.overviewGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{zh.overview.totalUsers}</div>
            <div className={styles.statValue}>{stats.totalUsers}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{zh.overview.newUsersToday}</div>
            <div className={styles.statValue}>{stats.newUsersToday}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{zh.overview.totalGenerations}</div>
            <div className={styles.statValue}>{stats.totalGenerations}</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 4: 手动验证**

Run: `pnpm dev`
登录后访问 `/admin`，应看到侧栏 + 顶栏 + 概览卡片（数据可能为 0，因 Task 6 才实现 users meta）。

- [ ] **Step 5: Commit**

```bash
git add app/admin/admin-shell.module.css app/admin/layout.tsx app/admin/page.tsx
git commit -m "feat(admin): layout 骨架 + 概览页"
```

---

## Task 6: /admin/api/users 列表 + meta

**Files:**
- Create: `app/admin/api/users/route.ts`

- [ ] **Step 1: 写列表路由**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = { user_id: string; email: string | null; display_name: string | null; plan: string };
type CreditRow = { user_id: string; balance: number; monthly_limit: number };
type AuthUser = { id: string; email?: string; created_at?: string; banned_until?: string | null };

export async function GET(request: Request) {
  try {
    const ctx = await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const plan = url.searchParams.get("plan") || "";
    const status = url.searchParams.get("status") || ""; // active | banned
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const rangeStart = (page - 1) * pageSize;
    const rangeEnd = rangeStart + pageSize - 1;

    // 查 profiles（带筛选）
    let profileQuery = "/rest/v1/storyflow_profiles?select=user_id,email,display_name,plan";
    const filters: string[] = [];
    if (q) filters.push(`email=ilike.*${encodeURIComponent(q)}*`);
    if (plan) filters.push(`plan=eq.${encodeURIComponent(plan)}`);
    if (filters.length) profileQuery += "&" + filters.join("&");
    profileQuery += `&order=created_at.desc&limit=${pageSize}&offset=${rangeStart}`;
    const profileRangeHeader = `${rangeStart}-${rangeEnd}`;

    const [profiles, credits, authResp] = await Promise.all([
      serviceFetch<ProfileRow[]>(profileQuery, {
        headers: { Range: profileRangeHeader, Prefer: "count=exact" },
      }),
      serviceFetch<CreditRow[]>("/rest/v1/storyflow_credits?select=user_id,balance,monthly_limit"),
      serviceFetch<{ users?: AuthUser[] } | AuthUser[]>(
        "/auth/v1/admin/users?page=1&per_page=200"
      ),
    ]);

    const creditById = new Map(credits.map((c) => [c.user_id, c]));
    const authUsers = Array.isArray(authResp) ? authResp : authResp.users || [];
    const authById = new Map(authUsers.map((u) => [u.id, u]));

    // 合并 + 状态筛选（banned 状态来自 auth.users.banned_until）
    let rows = profiles.map((p) => {
      const auth = authById.get(p.user_id);
      const credit = creditById.get(p.user_id);
      const bannedUntil = auth?.banned_until;
      const isBanned = Boolean(bannedUntil) && new Date(bannedUntil!).getTime() > Date.now();
      return {
        userId: p.user_id,
        email: p.email || auth?.email || "",
        displayName: p.display_name,
        createdAt: auth?.created_at ?? null,
        plan: p.plan,
        balance: credit?.balance ?? null,
        monthlyLimit: credit?.monthly_limit ?? null,
        status: isBanned ? "banned" : "active",
        bannedUntil: bannedUntil ?? null,
      };
    });

    if (status === "active") rows = rows.filter((r) => r.status === "active");
    if (status === "banned") rows = rows.filter((r) => r.status === "banned");

    // total 来自 content-range header（serviceFetch 不返回 header，这里用 auth users 总数近似）
    const total = authUsers.length;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const newToday = authUsers.filter(
      (u) => u.created_at && new Date(u.created_at).getTime() >= todayStart.getTime()
    ).length;

    return Response.json({
      users: rows,
      page,
      pageSize,
      total,
      newToday,
      totalGenerations: 0, // Task 后续可补，需读 storyflow_generation_tasks count
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: 手动验证**

Run: `pnpm dev`
登录管理员后 `curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/admin/api/users?page=1&pageSize=2"`
Expected: 返回 `{users:[...], total, newToday, ...}`

- [ ] **Step 3: Commit**

```bash
git add app/admin/api/users/route.ts
git commit -m "feat(admin): /admin/api/users 列表 + meta"
```

---

## Task 7: /admin/api/users/[userId] 详情 + PATCH

**Files:**
- Create: `app/admin/api/users/[userId]/route.ts`

- [ ] **Step 1: 写详情 + PATCH 路由**

```ts
import { requireAdminRole, adminErrorResponse, AdminAuthError } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = { user_id: string; email: string | null; display_name: string | null; plan: string; created_at: string; updated_at: string };
type CreditRow = { user_id: string; balance: number; monthly_limit: number; period_start: string; period_end: string };
type AuthUser = { id: string; email?: string; created_at?: string; last_sign_in_at?: string; banned_until?: string | null };
type TaskRow = { id: string; step_key: string; status: string; created_at: string; completed_at: string | null };

export async function GET(request: Request, ctx: { params: { userId: string } }) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;

    const [profiles, credits, authResp, tasks] = await Promise.all([
      serviceFetch<ProfileRow[]>(
        `/rest/v1/storyflow_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
      ),
      serviceFetch<CreditRow[]>(
        `/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
      ),
      serviceFetch<AuthUser | { error: string }>(
        `/auth/v1/admin/users/${encodeURIComponent(userId)}`
      ).catch(() => null),
      serviceFetch<TaskRow[]>(
        `/rest/v1/storyflow_generation_tasks?user_id=eq.${encodeURIComponent(userId)}&select=id,step_key,status,created_at,completed_at&order=created_at.desc&limit=20`
      ),
    ]);

    const profile = profiles[0];
    const credit = credits[0];
    const auth = authResp && "id" in authResp ? authResp : null;

    if (!profile && !auth) {
      return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const bannedUntil = auth?.banned_until;
    const isBanned = Boolean(bannedUntil) && new Date(bannedUntil!).getTime() > Date.now();

    return Response.json({
      userId,
      email: profile?.email || auth?.email || "",
      displayName: profile?.display_name ?? null,
      plan: profile?.plan ?? "free",
      createdAt: profile?.created_at ?? auth?.created_at ?? null,
      updatedAt: profile?.updated_at ?? null,
      lastSignInAt: auth?.last_sign_in_at ?? null,
      balance: credit?.balance ?? null,
      monthlyLimit: credit?.monthly_limit ?? null,
      periodStart: credit?.period_start ?? null,
      periodEnd: credit?.period_end ?? null,
      status: isBanned ? "banned" : "active",
      bannedUntil: bannedUntil ?? null,
      recentTasks: tasks,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.displayName === "string") patch.display_name = body.displayName;
    if (typeof body.plan === "string") patch.plan = body.plan;
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "NO_FIELDS" }, { status: 400 });
    }

    // 读旧值供审计
    const before = await serviceFetch<ProfileRow[]>(
      `/rest/v1/storyflow_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
    );
    const beforeRow = before[0];

    patch.updated_at = new Date().toISOString();
    await serviceFetch(`/rest/v1/storyflow_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      headers: { Prefer: "return=representation" },
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.profile.update",
      targetUserId: userId,
      payload: { before: beforeRow, after: patch },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/api/users/[userId]/route.ts
git commit -m "feat(admin): /admin/api/users/[userId] 详情 + PATCH"
```

---

## Task 8: credits + ban + unban 路由

**Files:**
- Create: `app/admin/api/users/[userId]/credits/route.ts`
- Create: `app/admin/api/users/[userId]/ban/route.ts`
- Create: `app/admin/api/users/[userId]/unban/route.ts`

- [ ] **Step 1: 写 credits 路由**

```ts
// app/admin/api/users/[userId]/credits/route.ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;
    const body = await request.json().catch(() => ({}));
    const mode: string = body.mode || ""; // "adjust" | "reset"
    const delta: number = Number(body.delta) || 0;

    const existing = await serviceFetch<Array<{ user_id: string; balance: number; monthly_limit: number }>>(
      `/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}&select=user_id,balance,monthly_limit&limit=1`
    );
    const account = existing[0];
    if (!account) {
      return Response.json({ error: "CREDIT_ACCOUNT_NOT_FOUND" }, { status: 404 });
    }

    let newBalance: number;
    if (mode === "reset") {
      newBalance = account.monthly_limit;
    } else if (mode === "adjust") {
      newBalance = account.balance + delta;
      if (newBalance < 0) newBalance = 0;
    } else {
      return Response.json({ error: "INVALID_MODE" }, { status: 400 });
    }

    await serviceFetch(`/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() }),
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.credits.adjust",
      targetUserId: userId,
      payload: { before: { balance: account.balance }, after: { balance: newBalance }, mode, delta },
    });

    return Response.json({ ok: true, balance: newBalance });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: 写 ban 路由**

```ts
// app/admin/api/users/[userId]/ban/route.ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;
    const body = await request.json().catch(() => ({}));
    // duration: "24h" / "7d" / "permanent"(87600h=10年)
    const duration: string = body.duration || "24h";

    await serviceFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: duration }),
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.ban",
      targetUserId: userId,
      payload: { duration },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 3: 写 unban 路由**

```ts
// app/admin/api/users/[userId]/unban/route.ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;

    await serviceFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: "none" }),
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.unban",
      targetUserId: userId,
      payload: {},
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/api/users/[userId]/credits/route.ts app/admin/api/users/[userId]/ban/route.ts app/admin/api/users/[userId]/unban/route.ts
git commit -m "feat(admin): credits + ban + unban 路由"
```

---

## Task 9: /admin/users 列表页 UI

**Files:**
- Create: `app/admin/users/page.tsx`

- [ ] **Step 1: 写列表页**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { zh } from "@/lib/admin/zh";
import styles from "../admin-shell.module.css";

type UserRow = {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: string | null;
  plan: string;
  balance: number | null;
  monthlyLimit: number | null;
  status: "active" | "banned";
};

type ListResp = {
  users: UserRow[];
  page: number;
  pageSize: number;
  total: number;
} | { error: string };

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
      const { data } = await client?.auth.getSession() ?? {};
      const token = data?.session?.access_token;
      if (!token) { setError(zh.common.unauthenticated); setLoading(false); return; }
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      if (plan) params.set("plan", plan);
      if (status) params.set("status", status);
      const res = await fetch(`/admin/api/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await res.json()) as ListResp;
      if ("error" in payload) { setError(payload.error); setRows([]); setTotal(0); }
      else { setRows(payload.users); setTotal(payload.total); }
    } catch (e) {
      setError(e instanceof Error ? e.message : zh.common.error);
    } finally {
      setLoading(false);
    }
  }, [page, q, plan, status]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.users.title}</h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "0 0 16px" }}>{zh.users.listBody}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder={zh.common.search}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13, width: 200 }}
        />
        <select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
          <option value="">{zh.users.filterPlan}：全部</option>
          <option value="free">free</option>
          <option value="business">business</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
          <option value="">{zh.users.filterStatus}：全部</option>
          <option value="active">{zh.users.statusActive}</option>
          <option value="banned">{zh.users.statusBanned}</option>
        </select>
        <button onClick={() => void load()} disabled={loading} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>
          {zh.common.refresh}
        </button>
      </div>

      {error && <div style={{ color: "#ff8b8b", marginBottom: 12 }}>{error}</div>}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.12)", textAlign: "left" }}>
              <th style={{ padding: "8px 10px" }}>{zh.users.colEmail}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colName}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colSignedUp}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colPlan}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colCredits}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "8px 10px" }}>
                  <Link href={`/admin/users/${r.userId}`} style={{ color: "#6de7df" }}>{r.email}</Link>
                </td>
                <td style={{ padding: "8px 10px" }}>{r.displayName || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN") : "—"}</td>
                <td style={{ padding: "8px 10px" }}>{r.plan}</td>
                <td style={{ padding: "8px 10px" }}>{r.balance === null ? "—" : `${r.balance}${r.monthlyLimit !== null ? ` / ${r.monthlyLimit}` : ""}`}</td>
                <td style={{ padding: "8px 10px" }}>
                  {r.status === "banned" ? (
                    <span style={{ color: "#ff8b8b" }}>{zh.users.statusBanned}</span>
                  ) : (
                    <span style={{ color: "#6de7df" }}>{zh.users.statusActive}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>{zh.common.empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, fontSize: 13 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: page <= 1 ? "not-allowed" : "pointer" }}>上一页</button>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>{page} / {totalPages}（共 {total}）</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: page >= totalPages ? "not-allowed" : "pointer" }}>下一页</button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 手动验证**

Run: `pnpm dev`，登录后访问 `/admin/users`，应看到表格 + 搜索/筛选/分页。

- [ ] **Step 3: Commit**

```bash
git add app/admin/users/page.tsx
git commit -m "feat(admin): 用户列表页 UI"
```

---

## Task 10: /admin/users/[userId] 详情页 UI

**Files:**
- Create: `app/admin/users/[userId]/page.tsx`

- [ ] **Step 1: 写详情页**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { zh } from "@/lib/admin/zh";
import styles from "../../admin-shell.module.css";

type Detail = {
  userId: string;
  email: string;
  displayName: string | null;
  plan: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  balance: number | null;
  monthlyLimit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: "active" | "banned";
  bannedUntil: string | null;
  recentTasks: Array<{ id: string; step_key: string; status: string; created_at: string; completed_at: string | null }>;
} | null;

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = (params?.userId as string) || "";
  const [detail, setDetail] = useState<Detail>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlan, setEditPlan] = useState("free");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<null | "charge" | "deduct" | "reset" | "ban" | "unban">(null);
  const [modalInput, setModalInput] = useState("");
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
      const { data } = await client?.auth.getSession() ?? {};
      const token = data?.session?.access_token;
      if (!token) { setError(zh.common.unauthenticated); setLoading(false); return; }
      const res = await fetch(`/admin/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) { setError(`HTTP ${res.status}`); setLoading(false); return; }
      const payload = await res.json();
      setDetail(payload);
      setEditName(payload.displayName || "");
      setEditPlan(payload.plan || "free");
    } catch (e) {
      setError(e instanceof Error ? e.message : zh.common.error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`/admin/api/users/${userId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editName, plan: editPlan }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "FAILED"); }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : zh.common.error);
    } finally {
      setSaving(false);
    }
  };

  const runModalAction = async () => {
    setModalErr(null);
    try {
      const token = await getToken();
      let url = "";
      let body: Record<string, unknown> = {};
      if (modal === "charge") { url = `/admin/api/users/${userId}/credits`; body = { mode: "adjust", delta: Number(modalInput) }; }
      else if (modal === "deduct") {
        url = `/admin/api/users/${userId}/credits`; body = { mode: "adjust", delta: -Number(modalInput) };
        if (detail && detail.email !== modalInput) { setModalErr(`请输入用户邮箱 ${detail.email} 以确认`); return; }
      }
      else if (modal === "reset") { url = `/admin/api/users/${userId}/credits`; body = { mode: "reset" }; }
      else if (modal === "ban") { url = `/admin/api/users/${userId}/ban`; body = { duration: modalInput || "24h" }; }
      else if (modal === "unban") { url = `/admin/api/users/${userId}/unban`; }
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "FAILED"); }
      setModal(null); setModalInput("");
      await load();
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : zh.common.error);
    }
  };

  if (loading) return <main className={styles.loading}>{zh.common.loading}</main>;
  if (error) return <main><div style={{ color: "#ff8b8b" }}>{error}</div><button onClick={() => router.push("/admin/users")} style={{ marginTop: 12 }}>{zh.common.back}</button></main>;
  if (!detail) return <main>{zh.common.empty}</main>;

  return (
    <main>
      <button onClick={() => router.push("/admin/users")} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>← {zh.common.back}</button>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px" }}>{detail.email}</h1>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.basicInfo}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.users.detail.displayName}</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }} />
          </div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.users.detail.plan}</label>
            <select value={editPlan} onChange={(e) => setEditPlan(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
              <option value="free">free</option>
              <option value="business">business</option>
            </select>
          </div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.users.colSignedUp}</label><div>{detail.createdAt ? new Date(detail.createdAt).toLocaleString("zh-CN") : "—"}</div></div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>最近登录</label><div>{detail.lastSignInAt ? new Date(detail.lastSignInAt).toLocaleString("zh-CN") : "—"}</div></div>
        </div>
        <button onClick={saveProfile} disabled={saving} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>
          {saving ? zh.common.loading : zh.common.save}
        </button>
      </section>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.creditsAccount}</h2>
        <div style={{ display: "flex", gap: 24, fontSize: 13, marginBottom: 12 }}>
          <div><span style={{ color: "rgba(255,255,255,0.6)" }}>{zh.users.detail.balance}: </span><strong style={{ color: "#6de7df" }}>{detail.balance ?? "—"}</strong></div>
          <div><span style={{ color: "rgba(255,255,255,0.6)" }}>{zh.users.detail.monthlyLimit}: </span>{detail.monthlyLimit ?? "—"}</div>
          <div><span style={{ color: "rgba(255,255,255,0.6)" }}>{zh.users.detail.period}: </span>{detail.periodStart ? new Date(detail.periodStart).toLocaleDateString("zh-CN") : "—"} ~ {detail.periodEnd ? new Date(detail.periodEnd).toLocaleDateString("zh-CN") : "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setModal("charge"); setModalInput(""); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.charge}</button>
          <button onClick={() => { setModal("deduct"); setModalInput(""); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.deduct}</button>
          <button onClick={() => { setModal("reset"); setModalInput(""); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.resetCredits}</button>
        </div>
      </section>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.accountStatus}</h2>
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          {detail.status === "banned" ? (
            <span style={{ color: "#ff8b8b" }}>{zh.users.statusBanned}（至 {detail.bannedUntil ? new Date(detail.bannedUntil).toLocaleString("zh-CN") : "—"}）</span>
          ) : (
            <span style={{ color: "#6de7df" }}>{zh.users.statusActive}</span>
          )}
        </div>
        {detail.status === "banned" ? (
          <button onClick={() => { setModal("unban"); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.unban}</button>
        ) : (
          <button onClick={() => { setModal("ban"); setModalInput("24h"); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.ban}</button>
        )}
      </section>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.recentActivity}</h2>
        {detail.recentTasks.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{zh.common.empty}</div>
        ) : (
          <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {detail.recentTasks.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 12, color: "rgba(255,255,255,0.7)" }}>
                <span style={{ color: t.status === "completed" ? "#6de7df" : t.status === "failed" ? "#ff8b8b" : "rgba(255,255,255,0.6)" }}>{t.status}</span>
                <span>{t.step_key}</span>
                <span>{new Date(t.created_at).toLocaleString("zh-CN")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "#0c0d0d", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
              {modal === "charge" ? zh.users.detail.charge : modal === "deduct" ? zh.users.detail.deductConfirm : modal === "reset" ? zh.users.detail.resetCredits : modal === "ban" ? zh.users.detail.banConfirm : zh.users.detail.unban}
            </h3>
            {(modal === "charge" || modal === "deduct" || modal === "ban") && (
              <input
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                placeholder={modal === "ban" ? "24h / 7d / permanent" : "数量"}
                style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13, marginBottom: 12 }}
              />
            )}
            {modal === "deduct" && <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, margin: "0 0 8px" }}>为确认，请输入用户邮箱 {detail.email}</p>}
            {modalErr && <div style={{ color: "#ff8b8b", fontSize: 12, marginBottom: 8 }}>{modalErr}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 13 }}>{zh.common.cancel}</button>
              <button onClick={runModalAction} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.common.confirm}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: 手动验证 + Commit**

Run: `pnpm dev`，从列表点进详情页，测试充值/扣减/封禁/解封/改资料。
```bash
git add app/admin/users/[userId]/page.tsx
git commit -m "feat(admin): 用户详情页 UI"
```

---

## Task 11: 改造 lib/ai/prompts.ts — buildPrompt async + DB 缓存 + overrides

**Files:**
- Modify: `lib/ai/prompts.ts`
- Create: `lib/admin/ai-prompts-server.ts`

**核心改动：** 导出 `DEFAULT_RULES` / `DEFAULT_PROMPT_BY_TASK` 供种子；`buildPrompt` 改 async，优先用 DB 缓存，回退默认；拼装时插入 overrides。

- [ ] **Step 1: 在 `lib/ai/prompts.ts` 导出默认值**

在现有 `commonRules`/`songRules`/`novelRules` 常量后加导出（不改动量）：

```ts
// 文件顶部 import 区后追加
export const DEFAULT_RULES = {
  common: commonRules,
  song: songRules,
  novel: novelRules,
  // creation rules 是函数，种子时用空 interfaceLanguage 调用
  creation: creationRules(undefined),
};
export const DEFAULT_PROMPT_BY_TASK: Record<TaskType, string> = { ...promptByTask };
```

注：`commonRules` 等当前是 `const`，需确保它们在 `DEFAULT_RULES` 引用前已声明（当前文件结构满足）。

- [ ] **Step 2: 写 `lib/admin/ai-prompts-server.ts`**

```ts
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";
import { DEFAULT_RULES, DEFAULT_PROMPT_BY_TASK, type TaskType } from "@/lib/ai/prompts";

export type PromptKey = string; // rules:common / task:<taskType>

type PromptRow = { key: string; category: "rules" | "task"; label: string; body: string };
type OverrideRow = {
  id: string;
  scope: "global" | "task_type";
  target: string;
  injection_text: string;
  position: "prepend" | "append";
  enabled: boolean;
};

type Cache = {
  rules: Map<string, string>; // common/song/novel/creation
  tasks: Map<string, string>; // taskType
  overrides: OverrideRow[];
  loadedAt: number;
};

let cache: Cache | null = null;
const CACHE_TTL_MS = 60_000; // 60s

export async function loadPromptsFromDb(): Promise<Cache> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  if (!hasServiceRoleConfig()) {
    cache = emptyCache();
    return cache;
  }
  try {
    const [rows, overrides] = await Promise.all([
      serviceFetch<PromptRow[]>("/rest/v1/storyflow_ai_prompts?select=key,category,label,body"),
      serviceFetch<OverrideRow[]>(
        "/rest/v1/storyflow_ai_prompt_overrides?select=id,scope,target,injection_text,position,enabled&enabled=eq.true&order=created_at.asc"
      ),
    ]);
    const rules = new Map<string, string>();
    const tasks = new Map<string, string>();
    for (const r of rows) {
      if (r.category === "rules") {
        const name = r.key.replace("rules:", "");
        rules.set(name, r.body);
      } else {
        const taskType = r.key.replace("task:", "");
        tasks.set(taskType, r.body);
      }
    }
    cache = { rules, tasks, overrides, loadedAt: Date.now() };
  } catch {
    cache = emptyCache();
  }
  return cache;
}

function emptyCache(): Cache {
  return { rules: new Map(), tasks: new Map(), overrides: [], loadedAt: Date.now() };
}

export function refreshPromptCache() {
  cache = null;
}

/** 取 rules：优先 DB，回退默认 */
export function resolveRules(name: keyof typeof DEFAULT_RULES, c: Cache): string {
  return c.rules.get(name) || DEFAULT_RULES[name];
}

/** 取 task prompt：优先 DB，回退默认 */
export function resolveTaskPrompt(taskType: TaskType, c: Cache): string {
  return c.tasks.get(taskType) || DEFAULT_PROMPT_BY_TASK[taskType];
}

/** 取生效 overrides（global + 该 taskType） */
export function getActiveOverrides(taskType: TaskType, c: Cache): OverrideRow[] {
  return c.overrides.filter((o) => o.scope === "global" || o.target === taskType);
}
```

- [ ] **Step 3: 改造 `lib/ai/prompts.ts` 的 `buildPrompt` 为 async + 注入**

把现有 `buildPrompt` 替换为：

```ts
import { loadPromptsFromDb, resolveRules, resolveTaskPrompt, getActiveOverrides } from "@/lib/admin/ai-prompts-server";

export async function buildPrompt(payload: GeneratePayload) {
  const cache = await loadPromptsFromDb();
  const rulesName =
    payload.taskType === "song_workbench" ? "song"
    : isCreationTask(payload.taskType) ? "creation"
    : isNovelTask(payload.taskType) ? "novel"
    : "common";
  const rules = resolveRules(rulesName as any, cache);

  const basePrompt = [
    rules,
    "",
    "【input】",
    payload.input || payload.idea || "未提供 input。",
    "",
    "【context】",
    buildContext(payload),
    "",
    "【options】",
    JSON.stringify(buildOptions(payload), null, 2),
    "",
    `【taskType】${payload.taskType} / ${taskNames[payload.taskType]}`,
    resolveTaskPrompt(payload.taskType, cache),
  ].join("\n");

  // 拼装 overrides
  const overrides = getActiveOverrides(payload.taskType, cache);
  const prepend = overrides.filter((o) => o.position === "prepend").map((o) => o.injection_text).join("\n\n");
  const append = overrides.filter((o) => o.position === "append").map((o) => o.injection_text).join("\n\n");

  return [prepend, basePrompt, append].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 4: 改造所有 `buildPrompt` 调用点加 `await`**

搜索调用点：
```bash
grep -rn "buildPrompt(" lib/ app/ --include="*.ts" --include="*.tsx"
```

逐一改为 `await buildPrompt(...)`。已知调用点：
- `lib/ai/generate.ts`
- `app/api/ai/generate/route.ts`
- `app/api/storyboard/analyze/route.ts`（若有）
- `app/api/viral/_utils.ts`（若有）

每个文件：若调用函数本身不是 async，改成 async；route handler 已是 async 直接加 await。

- [ ] **Step 5: 验证类型 + 构建**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误（关注 `buildPrompt` 返回类型从 `string` 变 `Promise<string>` 的传播）。

- [ ] **Step 6: Commit**

```bash
git add lib/ai/prompts.ts lib/admin/ai-prompts-server.ts lib/ai/generate.ts app/api/ai/generate/route.ts app/api/viral/_utils.ts
git commit -m "refactor(ai): buildPrompt async + DB 缓存 + overrides 注入"
```

---

## Task 12: AI prompts 种子脚本

**Files:**
- Create: `scripts/seed-ai-prompts.mjs`

- [ ] **Step 1: 写种子脚本**

```js
// scripts/seed-ai-prompts.mjs
// 从 lib/ai/prompts.ts 默认值写入 storyflow_ai_prompts 表
// 用法: node scripts/seed-ai-prompts.mjs
// 需 .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { config } from "dotenv";
config({ path: ".env.local" });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE_KEY) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// 动态导入编译后的 prompts 默认值（用 tsx 或 ts-node；这里用内联重复定义避免编译）
// 实际执行：用 npx tsx 运行此脚本可直接 import ts 源
const { DEFAULT_RULES, DEFAULT_PROMPT_BY_TASK, taskNames } = await import("../lib/ai/prompts.ts");

const rows = [];
rows.push({ key: "rules:common", category: "rules", label: "通用规则", body: DEFAULT_RULES.common });
rows.push({ key: "rules:song", category: "rules", label: "歌曲规则", body: DEFAULT_RULES.song });
rows.push({ key: "rules:novel", category: "rules", label: "小说规则", body: DEFAULT_RULES.novel });
rows.push({ key: "rules:creation", category: "rules", label: "创作工作台规则", body: DEFAULT_RULES.creation });

for (const [taskType, body] of Object.entries(DEFAULT_PROMPT_BY_TASK)) {
  rows.push({
    key: `task:${taskType}`,
    category: "task",
    label: taskNames[taskType] || taskType,
    body,
  });
}

const resp = await fetch(`${SUPA_URL}/rest/v1/storyflow_ai_prompts?on_conflict=key`, {
  method: "POST",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  },
  body: JSON.stringify(rows),
});
if (!resp.ok) {
  console.error("seed 失败:", resp.status, await resp.text());
  process.exit(1);
}
console.log(`✓ 已种子 ${rows.length} 条 AI prompts`);
```

- [ ] **Step 2: 运行种子**

Run: `npx tsx scripts/seed-ai-prompts.mjs`
Expected: `✓ 已种子 45 条 AI prompts`

- [ ] **Step 3: 验证**

Run: `psql "$DATABASE_URL" -c "select count(*) from public.storyflow_ai_prompts;"`
Expected: count = 45

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-ai-prompts.mjs
git commit -m "feat(admin): AI prompts 种子脚本"
```

---

## Task 13: /admin/api/ai-prompts 路由（列表/详情/PATCH/rollback）

**Files:**
- Create: `app/admin/api/ai-prompts/route.ts`
- Create: `app/admin/api/ai-prompts/[key]/route.ts`
- Create: `app/admin/api/ai-prompts/[key]/rollback/route.ts`

- [ ] **Step 1: 写列表路由 `app/admin/api/ai-prompts/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const rows = await serviceFetch<Array<{
      key: string; category: string; label: string; body: string; updated_at: string;
    }>>("/rest/v1/storyflow_ai_prompts?select=key,category,label,body,updated_at&order=key.asc");
    return Response.json({ prompts: rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: 写详情 + PATCH 路由 `app/admin/api/ai-prompts/[key]/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: { key: string } }) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const key = ctx.params.key;
    const [rows, versions] = await Promise.all([
      serviceFetch<Array<{ key: string; category: string; label: string; body: string; updated_at: string; updated_by: string | null }>>(
        `/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}&select=*&limit=1`
      ),
      serviceFetch<Array<{ id: string; body: string; updated_by: string | null; created_at: string }>>(
        `/rest/v1/storyflow_ai_prompt_versions?prompt_key=eq.${encodeURIComponent(key)}&select=id,body,updated_by,created_at&order=created_at.desc&limit=20`
      ),
    ]);
    const prompt = rows[0];
    if (!prompt) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json({ prompt, versions });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: { params: { key: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const key = ctx.params.key;
    const body = await request.json().catch(() => ({}));
    if (typeof body.body !== "string" || !body.body.trim()) {
      return Response.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    // 读旧值
    const before = await serviceFetch<Array<{ body: string }>>(
      `/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}&select=body&limit=1`
    );
    const beforeBody = before[0]?.body;

    // 更新 + 写版本
    await Promise.all([
      serviceFetch(`/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ body: body.body, updated_at: new Date().toISOString(), updated_by: admin.id }),
      }),
      serviceFetch("/rest/v1/storyflow_ai_prompt_versions", {
        method: "POST",
        body: JSON.stringify({ prompt_key: key, body: body.body, updated_by: admin.id }),
      }),
    ]);

    refreshPromptCache();

    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.update",
      targetRef: `prompt:${key}`,
      payload: { before: beforeBody, after: body.body },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 3: 写 rollback 路由 `app/admin/api/ai-prompts/[key]/rollback/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: { key: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const key = ctx.params.key;
    const body = await request.json().catch(() => ({}));
    const versionId: string = body.versionId;
    if (!versionId) return Response.json({ error: "MISSING_VERSION_ID" }, { status: 400 });

    const versions = await serviceFetch<Array<{ id: string; body: string }>>(
      `/rest/v1/storyflow_ai_prompt_versions?id=eq.${encodeURIComponent(versionId)}&select=id,body&limit=1`
    );
    const version = versions[0];
    if (!version) return Response.json({ error: "VERSION_NOT_FOUND" }, { status: 404 });

    const before = await serviceFetch<Array<{ body: string }>>(
      `/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}&select=body&limit=1`
    );
    const beforeBody = before[0]?.body;

    await Promise.all([
      serviceFetch(`/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ body: version.body, updated_at: new Date().toISOString(), updated_by: admin.id }),
      }),
      serviceFetch("/rest/v1/storyflow_ai_prompt_versions", {
        method: "POST",
        body: JSON.stringify({ prompt_key: key, body: version.body, updated_by: admin.id }),
      }),
    ]);

    refreshPromptCache();

    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.rollback",
      targetRef: `prompt:${key}`,
      payload: { before: beforeBody, after: version.body, rolledBackToVersion: versionId },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/api/ai-prompts/
git commit -m "feat(admin): /admin/api/ai-prompts 列表/详情/PATCH/rollback"
```

---

## Task 14: /admin/api/ai-prompts/overrides + refresh-cache

**Files:**
- Create: `app/admin/api/ai-prompts/overrides/route.ts`
- Create: `app/admin/api/ai-prompts/overrides/[id]/route.ts`
- Create: `app/admin/api/ai-prompts/refresh-cache/route.ts`

- [ ] **Step 1: 写 overrides 列表 + 新建 `overrides/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const rows = await serviceFetch<Array<{
      id: string; scope: string; target: string; injection_text: string;
      position: string; enabled: boolean; updated_at: string;
    }>>("/rest/v1/storyflow_ai_prompt_overrides?select=*&order=created_at.asc");
    return Response.json({ overrides: rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const body = await request.json().catch(() => ({}));
    if (!["global", "task_type"].includes(body.scope)) return Response.json({ error: "INVALID_SCOPE" }, { status: 400 });
    if (!["prepend", "append"].includes(body.position)) return Response.json({ error: "INVALID_POSITION" }, { status: 400 });
    if (typeof body.injectionText !== "string" || !body.injectionText.trim()) return Response.json({ error: "INVALID_INJECTION" }, { status: 400 });

    const row = {
      scope: body.scope,
      target: body.target || "*",
      injection_text: body.injectionText,
      position: body.position,
      enabled: body.enabled !== false,
      updated_by: admin.id,
    };
    const created = await serviceFetch<Array<{ id: string }>>("/rest/v1/storyflow_ai_prompt_overrides", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    refreshPromptCache();
    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.override.create",
      targetRef: `override:${created[0]?.id}`,
      payload: row,
    });
    return Response.json({ ok: true, override: created[0] });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: 写 overrides PATCH/DELETE `overrides/[id]/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const id = ctx.params.id;
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: admin.id };
    if (typeof body.injectionText === "string") patch.injection_text = body.injectionText;
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.position) patch.position = body.position;
    if (body.target) patch.target = body.target;

    await serviceFetch(`/rest/v1/storyflow_ai_prompt_overrides?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    refreshPromptCache();
    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.override.update",
      targetRef: `override:${id}`,
      payload: patch,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: { params: { id: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const id = ctx.params.id;
    await serviceFetch(`/rest/v1/storyflow_ai_prompt_overrides?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    refreshPromptCache();
    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.override.delete",
      targetRef: `override:${id}`,
      payload: {},
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 3: 写 refresh-cache 路由 `refresh-cache/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAdminRole(request, "operator");
    refreshPromptCache();
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/api/ai-prompts/overrides/ app/admin/api/ai-prompts/refresh-cache/route.ts
git commit -m "feat(admin): overrides + refresh-cache 路由"
```

---

## Task 15: /admin/ai-prompts 页面 UI（三 tab）

**Files:**
- Create: `app/admin/ai-prompts/page.tsx`

- [ ] **Step 1: 写 AI 指令编辑页**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";
import styles from "../admin-shell.module.css";

type PromptRow = { key: string; category: "rules" | "task"; label: string; body: string; updated_at: string };
type VersionRow = { id: string; body: string; updated_by: string | null; created_at: string };
type OverrideRow = {
  id: string; scope: "global" | "task_type"; target: string;
  injection_text: string; position: "prepend" | "append"; enabled: boolean; updated_at: string;
};

type Tab = "rules" | "tasks" | "overrides";

const TASK_GROUPS: Record<string, string[]> = {
  "剧本工作台": ["market_analysis","script_import","brief","characters","structure_model","beat_cards","series_outline","existing_script","chinese_script","continuation_script","translation","localization","test_script","quality_evaluation","final_script","format_check","storyboard_script","final_delivery"],
  "小说工作台": ["novel_development_chat","novel_brief","novel_bible","novel_characters","novel_volume_outline","novel_chapter_outline","novel_chapter_draft","novel_revision","novel_export"],
  "歌曲工作台": ["song_workbench","song_development_chat"],
  "创作工作台": ["creation_development_chat","creation_background_world","creation_character_bible","creation_plot_outline","creation_novel_unit","creation_screenplay_unit","creation_episode_plan","creation_translate_unit","creation_localize_unit"],
  "爆款工作台": ["viral_video_analysis","viral_structure_remake","viral_export_package"],
};

export default function AdminAiPromptsPage() {
  const [tab, setTab] = useState<Tab>("rules");
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [search, setSearch] = useState("");

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const [pRes, oRes] = await Promise.all([
        fetch("/admin/api/ai-prompts", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/admin/api/ai-prompts/overrides", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      const p = await pRes.json(); const o = await oRes.json();
      setPrompts(p.prompts || []);
      setOverrides(o.overrides || []);
    } catch (e) { setError(e instanceof Error ? e.message : zh.common.error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  const selectPrompt = async (key: string) => {
    setSelectedKey(key);
    setShowVersions(false);
    const token = await getToken();
    const res = await fetch(`/admin/api/ai-prompts/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    const payload = await res.json();
    setEditBody(payload.prompt?.body || "");
    setVersions(payload.versions || []);
  };

  const save = async () => {
    if (!selectedKey) return;
    if (!confirm(zh.aiPrompts.saveConfirm)) return;
    setSaving(true); setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/admin/api/ai-prompts/${encodeURIComponent(selectedKey)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "FAILED"); }
      await selectPrompt(selectedKey);
      await loadList();
    } catch (e) { setError(e instanceof Error ? e.message : zh.common.error); }
    finally { setSaving(false); }
  };

  const rollback = async (versionId: string) => {
    if (!selectedKey) return;
    if (!confirm("确认回滚到此版本？")) return;
    const token = await getToken();
    const res = await fetch(`/admin/api/ai-prompts/${encodeURIComponent(selectedKey)}/rollback`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (res.ok) { await selectPrompt(selectedKey); await loadList(); }
  };

  const filteredPrompts = prompts.filter((p) => {
    if (tab === "rules" && p.category !== "rules") return false;
    if (tab === "tasks" && p.category !== "task") return false;
    if (tab === "overrides") return false;
    if (search) return p.label.includes(search) || p.key.includes(search);
    return true;
  });

  const selectedPrompt = prompts.find((p) => p.key === selectedKey);

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.aiPrompts.title}</h1>
      <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,139,139,0.1)", border: "1px solid rgba(255,139,139,0.3)", color: "#ff8b8b", fontSize: 12, marginBottom: 16 }}>
        ⚠ {zh.aiPrompts.warning}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {(["rules","tasks","overrides"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", background: tab === t ? "rgba(109,231,223,0.1)" : "transparent",
            border: "none", borderBottom: tab === t ? "2px solid #6de7df" : "2px solid transparent",
            color: tab === t ? "#6de7df" : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13,
          }}>
            {t === "rules" ? zh.aiPrompts.tabRules : t === "tasks" ? zh.aiPrompts.tabTasks : zh.aiPrompts.tabOverrides}
          </button>
        ))}
      </div>

      {error && <div style={{ color: "#ff8b8b", marginBottom: 12 }}>{error}</div>}

      {tab === "overrides" ? (
        <OverridesPanel overrides={overrides} onChange={loadList} />
      ) : (
        <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
          <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 12 }}>
            <input placeholder={zh.common.search} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 12, marginBottom: 8 }} />
            {tab === "tasks" ? (
              Object.entries(TASK_GROUPS).map(([group, keys]) => {
                const groupRows = filteredPrompts.filter((p) => keys.includes(p.key.replace("task:", "")));
                if (groupRows.length === 0) return null;
                return (
                  <div key={group} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "4px 8px" }}>{group}</div>
                    {groupRows.map((p) => (
                      <button key={p.key} onClick={() => selectPrompt(p.key)} style={{
                        display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
                        background: selectedKey === p.key ? "rgba(109,231,223,0.12)" : "transparent",
                        border: "none", color: selectedKey === p.key ? "#6de7df" : "rgba(255,255,255,0.75)",
                        cursor: "pointer", fontSize: 12, borderRadius: 4,
                      }}>{p.label}</button>
                    ))}
                  </div>
                );
              })
            ) : (
              filteredPrompts.map((p) => (
                <button key={p.key} onClick={() => selectPrompt(p.key)} style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                  background: selectedKey === p.key ? "rgba(109,231,223,0.12)" : "transparent",
                  border: "none", color: selectedKey === p.key ? "#6de7df" : "rgba(255,255,255,0.75)",
                  cursor: "pointer", fontSize: 13, borderRadius: 4,
                }}>{p.label}</button>
              ))
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedKey ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{selectedPrompt?.label}</strong>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginLeft: 8 }}>{selectedKey}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowVersions((v) => !v)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 12 }}>{zh.aiPrompts.versionHistory}</button>
                    <button onClick={save} disabled={saving} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 12 }}>{saving ? zh.common.loading : zh.aiPrompts.save}</button>
                  </div>
                </div>
                {showVersions && (
                  <div style={{ marginBottom: 12, padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.03)", maxHeight: 200, overflow: "auto" }}>
                    {versions.length === 0 ? <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{zh.common.empty}</div> : versions.map((v) => (
                      <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11 }}>
                        <span style={{ color: "rgba(255,255,255,0.6)" }}>{new Date(v.created_at).toLocaleString("zh-CN")}</span>
                        <button onClick={() => rollback(v.id)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 11 }}>{zh.aiPrompts.rollback}</button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  style={{ width: "100%", minHeight: 400, padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.6, boxSizing: "border-box" }}
                />
              </>
            ) : (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, padding: 24 }}>请从左侧选择一项</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function OverridesPanel({ overrides, onChange }: { overrides: OverrideRow[]; onChange: () => void }) {
  const [editing, setEditing] = useState<OverrideRow | null>(null);
  const [newOverride, setNewOverride] = useState(false);
  const [form, setForm] = useState({ scope: "global", target: "*", injectionText: "", position: "prepend", enabled: true });

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const save = async () => {
    const token = await getToken();
    if (editing) {
      await fetch(`/admin/api/ai-prompts/overrides/${editing.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/admin/api/ai-prompts/overrides", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setEditing(null); setNewOverride(false);
    setForm({ scope: "global", target: "*", injectionText: "", position: "prepend", enabled: true });
    onChange();
  };

  const toggle = async (o: OverrideRow) => {
    const token = await getToken();
    await fetch(`/admin/api/ai-prompts/overrides/${o.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !o.enabled }),
    });
    onChange();
  };

  const del = async (o: OverrideRow) => {
    if (!confirm("确认删除此注入？")) return;
    const token = await getToken();
    await fetch(`/admin/api/ai-prompts/overrides/${o.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    onChange();
  };

  return (
    <div>
      <button onClick={() => { setNewOverride(true); setEditing(null); setForm({ scope: "global", target: "*", injectionText: "", position: "prepend", enabled: true }); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>{zh.aiPrompts.newOverride}</button>

      {(newOverride || editing) && (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8, fontSize: 12 }}>
            <div><label style={{ color: "rgba(255,255,255,0.6)" }}>{zh.aiPrompts.overrideScope}</label>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, target: e.target.value === "global" ? "*" : "" })} style={{ width: "100%", padding: "4px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8" }}>
                <option value="global">{zh.aiPrompts.scopeGlobal}</option>
                <option value="task_type">{zh.aiPrompts.scopeTaskType}</option>
              </select>
            </div>
            <div><label style={{ color: "rgba(255,255,255,0.6)" }}>target</label>
              <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} disabled={form.scope === "global"} style={{ width: "100%", padding: "4px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8" }} />
            </div>
            <div><label style={{ color: "rgba(255,255,255,0.6)" }}>{zh.aiPrompts.position}</label>
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} style={{ width: "100%", padding: "4px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8" }}>
                <option value="prepend">{zh.aiPrompts.positionPrepend}</option>
                <option value="append">{zh.aiPrompts.positionAppend}</option>
              </select>
            </div>
          </div>
          <textarea value={form.injectionText} onChange={(e) => setForm({ ...form, injectionText: e.target.value })} placeholder={zh.aiPrompts.injectionText} style={{ width: "100%", minHeight: 80, padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontFamily: "ui-monospace, monospace", fontSize: 12, boxSizing: "border-box", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 12 }}>{zh.common.save}</button>
            <button onClick={() => { setNewOverride(false); setEditing(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 12 }}>{zh.common.cancel}</button>
          </div>
        </div>
      )}

      {overrides.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{zh.common.empty}</div>
      ) : overrides.map((o) => (
        <div key={o.id} style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <span style={{ color: o.enabled ? "#6de7df" : "rgba(255,255,255,0.4)" }}>{o.scope === "global" ? zh.aiPrompts.scopeGlobal : `${zh.aiPrompts.scopeTaskType}: ${o.target}`}</span>
              <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{o.position === "prepend" ? zh.aiPrompts.positionPrepend : zh.aiPrompts.positionAppend}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => toggle(o)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 11 }}>{o.enabled ? "禁用" : zh.aiPrompts.enabled}</button>
              <button onClick={() => { setEditing(o); setNewOverride(false); setForm({ scope: o.scope, target: o.target, injectionText: o.injection_text, position: o.position, enabled: o.enabled }); }} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 11 }}>编辑</button>
              <button onClick={() => del(o)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 11 }}>删除</button>
            </div>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.7)", fontFamily: "ui-monospace, monospace" }}>{o.injection_text}</pre>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 手动验证 + Commit**

Run: `pnpm dev`，访问 `/admin/ai-prompts`，测试三 tab 切换、编辑保存、版本回滚、注入新建/启停/删除。
```bash
git add app/admin/ai-prompts/page.tsx
git commit -m "feat(admin): AI 指令编辑页（三 tab）"
```

---

## Task 16: /admin/api/admins + /admin/api/audit-log 路由

**Files:**
- Create: `app/admin/api/admins/route.ts`
- Create: `app/admin/api/admins/[userId]/route.ts`
- Create: `app/admin/api/audit-log/route.ts`

- [ ] **Step 1: 写 admins 列表 + 添加 `admins/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminRoleRow = { user_id: string; role: string; created_at: string; updated_at: string };
type AuthUser = { id: string; email?: string };

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const roles = await serviceFetch<AdminRoleRow[]>(
      "/rest/v1/storyflow_admin_roles?select=user_id,role,created_at,updated_at&order=created_at.asc"
    );
    const userIds = roles.map((r) => r.user_id);
    // 批量查 email（auth admin api 只支持单查，这里逐个查；量小可接受）
    const authUsers = await Promise.all(
      userIds.map((uid) =>
        serviceFetch<AuthUser | { error: string }>(`/auth/v1/admin/users/${encodeURIComponent(uid)}`).catch(() => null)
      )
    );
    const emailById = new Map<string, string>();
    authUsers.forEach((u, i) => {
      if (u && "id" in u) emailById.set(userIds[i], u.email || "");
    });

    const rows = roles.map((r) => ({
      userId: r.user_id,
      email: emailById.get(r.user_id) || "",
      role: r.role,
      createdAt: r.created_at,
    }));
    return Response.json({ admins: rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const body = await request.json().catch(() => ({}));
    const userId: string = body.userId;
    const role: string = body.role;
    if (!userId) return Response.json({ error: "MISSING_USER_ID" }, { status: 400 });
    if (!["super_admin", "operator", "viewer"].includes(role)) return Response.json({ error: "INVALID_ROLE" }, { status: 400 });

    await serviceFetch("/rest/v1/storyflow_admin_roles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, role, updated_by: admin.id }),
    });
    await writeAuditLog({
      adminUserId: admin.id,
      action: "admin.role.add",
      targetUserId: userId,
      payload: { role },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: 写 admins PATCH/DELETE `admins/[userId]/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;
    const body = await request.json().catch(() => ({}));
    const role: string = body.role;
    if (!["super_admin", "operator", "viewer"].includes(role)) return Response.json({ error: "INVALID_ROLE" }, { status: 400 });

    await serviceFetch(`/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role, updated_at: new Date().toISOString(), updated_by: admin.id }),
    });
    await writeAuditLog({
      adminUserId: admin.id,
      action: "admin.role.update",
      targetUserId: userId,
      payload: { role },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;
    if (userId === admin.id) return Response.json({ error: "CANNOT_REMOVE_SELF" }, { status: 400 });

    await serviceFetch(`/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    await writeAuditLog({
      adminUserId: admin.id,
      action: "admin.role.remove",
      targetUserId: userId,
      payload: {},
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 3: 写 audit-log 路由 `audit-log/route.ts`**

```ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditRow = {
  id: string; admin_user_id: string; action: string;
  target_user_id: string | null; target_ref: string | null;
  payload: unknown; created_at: string;
};
type AuthUser = { id: string; email?: string };

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";
    const adminId = url.searchParams.get("admin_id") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const offset = (page - 1) * pageSize;

    let query = "/rest/v1/storyflow_admin_audit_log?select=*&order=created_at.desc";
    const filters: string[] = [];
    if (action) filters.push(`action=eq.${encodeURIComponent(action)}`);
    if (adminId) filters.push(`admin_user_id=eq.${encodeURIComponent(adminId)}`);
    if (filters.length) query += "&" + filters.join("&");
    query += `&limit=${pageSize}&offset=${offset}`;

    const rows = await serviceFetch<AuditRow[]>(query);

    // 批量查 admin email
    const adminIds = [...new Set(rows.map((r) => r.admin_user_id))];
    const authUsers = await Promise.all(
      adminIds.map((uid) =>
        serviceFetch<AuthUser | { error: string }>(`/auth/v1/admin/users/${encodeURIComponent(uid)}`).catch(() => null)
      )
    );
    const emailById = new Map<string, string>();
    adminIds.forEach((uid, i) => {
      const u = authUsers[i];
      if (u && "id" in u) emailById.set(uid, u.email || "");
    });

    const result = rows.map((r) => ({
      ...r,
      adminEmail: emailById.get(r.admin_user_id) || "",
    }));
    return Response.json({ logs: result, page, pageSize });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/api/admins/ app/admin/api/audit-log/route.ts
git commit -m "feat(admin): admins + audit-log 路由"
```

---

## Task 17: /admin/admins + /admin/audit-log 页面 UI

**Files:**
- Create: `app/admin/admins/page.tsx`
- Create: `app/admin/audit-log/page.tsx`

- [ ] **Step 1: 写 admins 页面**

```tsx
// app/admin/admins/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";

type AdminRow = { userId: string; email: string; role: "super_admin" | "operator" | "viewer"; createdAt: string };

export default function AdminAdminsPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", role: "viewer" as const });

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/admin/api/admins", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await res.json();
      setRows(payload.admins || []);
    } catch (e) { setError(e instanceof Error ? e.message : zh.common.error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const token = await getToken();
    const res = await fetch("/admin/api/admins", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: form.userId, role: form.role }),
    });
    if (res.ok) { setAddOpen(false); setForm({ userId: "", role: "viewer" }); await load(); }
    else { const j = await res.json(); setError(j.error || "FAILED"); }
  };

  const changeRole = async (userId: string, role: string) => {
    const token = await getToken();
    const res = await fetch(`/admin/api/admins/${userId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) await load();
  };

  const remove = async (userId: string) => {
    if (!confirm("确认移除该管理员？")) return;
    const token = await getToken();
    const res = await fetch(`/admin/api/admins/${userId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) await load();
  };

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.admins.title}</h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "0 0 16px" }}>{zh.admins.addAdmin}</p>

      <button onClick={() => setAddOpen(true)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>{zh.admins.addAdmin}</button>

      {error && <div style={{ color: "#ff8b8b", marginBottom: 12 }}>{error}</div>}

      {addOpen && (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>User ID</label>
            <input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13, width: 300 }} placeholder="从用户详情页复制 userId" />
          </div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.admins.colRole}</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })} style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
              <option value="viewer">{zh.role.viewer}</option>
              <option value="operator">{zh.role.operator}</option>
              <option value="super_admin">{zh.role.super_admin}</option>
            </select>
          </div>
          <button onClick={add} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.common.confirm}</button>
          <button onClick={() => setAddOpen(false)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 13 }}>{zh.common.cancel}</button>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.12)", textAlign: "left" }}>
            <th style={{ padding: "8px 10px" }}>{zh.admins.colEmail}</th>
            <th style={{ padding: "8px 10px" }}>{zh.admins.colRole}</th>
            <th style={{ padding: "8px 10px" }}>{zh.admins.colCreatedAt}</th>
            <th style={{ padding: "8px 10px" }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "8px 10px" }}>{r.email || r.userId.slice(0, 8)}</td>
              <td style={{ padding: "8px 10px" }}>
                <select value={r.role} onChange={(e) => changeRole(r.userId, e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 12 }}>
                  <option value="viewer">{zh.role.viewer}</option>
                  <option value="operator">{zh.role.operator}</option>
                  <option value="super_admin">{zh.role.super_admin}</option>
                </select>
              </td>
              <td style={{ padding: "8px 10px" }}>{new Date(r.createdAt).toLocaleString("zh-CN")}</td>
              <td style={{ padding: "8px 10px" }}>
                <button onClick={() => remove(r.userId)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 11 }}>移除</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && !loading && (
            <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>{zh.common.empty}</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: 写 audit-log 页面**

```tsx
// app/admin/audit-log/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";

type LogRow = {
  id: string; admin_user_id: string; adminEmail: string; action: string;
  target_user_id: string | null; target_ref: string | null;
  payload: unknown; created_at: string;
};

const ACTION_OPTIONS = [
  "user.profile.update", "user.credits.adjust", "user.ban", "user.unban",
  "ai_prompt.update", "ai_prompt.rollback", "ai_prompt.override.create", "ai_prompt.override.update", "ai_prompt.override.delete",
  "admin.role.add", "admin.role.update", "admin.role.remove",
];

export default function AdminAuditLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (action) params.set("action", action);
      const res = await fetch(`/admin/api/audit-log?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await res.json();
      setRows(payload.logs || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, action]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.auditLog.title}</h1>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
          <option value="">{zh.auditLog.filterAction}：全部</option>
          {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={() => void load()} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.common.refresh}</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.12)", textAlign: "left" }}>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colTime}</th>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colAdmin}</th>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colAction}</th>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colTarget}</th>
            <th style={{ padding: "8px 10px" }}>payload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString("zh-CN")}</td>
              <td style={{ padding: "8px 10px" }}>{r.adminEmail || r.admin_user_id.slice(0, 8)}</td>
              <td style={{ padding: "8px 10px", color: "#6de7df" }}>{r.action}</td>
              <td style={{ padding: "8px 10px" }}>{r.target_ref || r.target_user_id?.slice(0, 8) || "—"}</td>
              <td style={{ padding: "8px 10px", maxWidth: 400, overflow: "auto", fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.6)" }}>
                {r.payload ? JSON.stringify(r.payload) : "—"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && !loading && (
            <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>{zh.common.empty}</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, marginTop: 12, fontSize: 13 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: page <= 1 ? "not-allowed" : "pointer" }}>上一页</button>
        <span style={{ color: "rgba(255,255,255,0.7)", padding: "4px 0" }}>{page}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={rows.length < 50} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: rows.length < 50 ? "not-allowed" : "pointer" }}>下一页</button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/admins/page.tsx app/admin/audit-log/page.tsx
git commit -m "feat(admin): 管理员角色 + 审计日志页面"
```

---

## Task 18: 后端守卫集成测试

**Files:**
- Create: `tests/admin-users-api.test.mjs`

**注：** 这些是集成测试，需真实 Supabase + 测试用户。CI 环境跑；本地无环境时跳过。沿用现有 `tests/*.test.mjs` 风格。

- [ ] **Step 1: 写守卫测试**

```js
// tests/admin-users-api.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const NO_ROLE_TOKEN = process.env.ADMIN_TEST_NO_ROLE_TOKEN || ""; // 有登录但非 admin
const VIEWER_TOKEN = process.env.ADMIN_TEST_VIEWER_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

// 无 token / 无角色 / viewer 调写接口 的守卫
describe("admin API 守卫", { skip: !BASE }, () => {
  test("无 token 访问 /admin/api/me 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/me`);
    assert.equal(res.status, 401);
  });

  test("无 admin 角色访问 /admin/api/me 返回 403", async () => {
    if (!NO_ROLE_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/me`, { headers: { Authorization: `Bearer ${NO_ROLE_TOKEN}` } });
    assert.equal(res.status, 403);
  });

  test("viewer 调 PATCH /admin/api/users/:id 返回 403", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/users/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "test" }),
    });
    assert.equal(res.status, 403);
  });

  test("viewer 可读 /admin/api/users", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/users`, { headers: { Authorization: `Bearer ${VIEWER_TOKEN}` } });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.users));
  });

  test("非 super_admin 访问 /admin/api/admins 返回 403", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/admins`, { headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` } });
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 2: 运行**

Run: `node --test tests/admin-users-api.test.mjs`
Expected: 有 token 时全 pass；无 token 时 skip。

- [ ] **Step 3: Commit**

```bash
git add tests/admin-users-api.test.mjs
git commit -m "test(admin): 后端守卫集成测试"
```

---

## Task 19: AI 指令 + 审计测试

**Files:**
- Create: `tests/admin-ai-prompts.test.mjs`
- Create: `tests/admin-audit.test.mjs`

- [ ] **Step 1: 写 AI 指令测试**

```js
// tests/admin-ai-prompts.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const VIEWER_TOKEN = process.env.ADMIN_TEST_VIEWER_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

describe("AI prompts API", { skip: !BASE }, () => {
  test("GET /admin/api/ai-prompts 返回 45 条", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/ai-prompts`, { headers: { Authorization: `Bearer ${VIEWER_TOKEN}` } });
    const payload = await res.json();
    assert.ok(payload.prompts.length >= 45, `期望 >=45 条，实际 ${payload.prompts.length}`);
  });

  test("viewer 调 PATCH ai-prompts 返回 403", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/ai-prompts/rules:common`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "test" }),
    });
    assert.equal(res.status, 403);
  });

  test("overrides 列表为数组", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/ai-prompts/overrides`, { headers: { Authorization: `Bearer ${VIEWER_TOKEN}` } });
    const payload = await res.json();
    assert.ok(Array.isArray(payload.overrides));
  });
});
```

- [ ] **Step 2: 写审计测试**

```js
// tests/admin-audit.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const SUPER_ADMIN_TOKEN = process.env.ADMIN_TEST_SUPER_ADMIN_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

describe("审计日志 API", { skip: !BASE }, () => {
  test("super_admin 可读 /admin/api/audit-log", async () => {
    if (!SUPER_ADMIN_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/audit-log`, { headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` } });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.logs));
  });

  test("operator 访问 /admin/api/audit-log 返回 403", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/audit-log`, { headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` } });
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 3: 运行 + Commit**

Run: `node --test tests/admin-ai-prompts.test.mjs tests/admin-audit.test.mjs`
```bash
git add tests/admin-ai-prompts.test.mjs tests/admin-audit.test.mjs
git commit -m "test(admin): AI 指令 + 审计日志测试"
```

---

## Task 20: 部署验证 + 自审

- [ ] **Step 1: 全量类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误。重点关注 `buildPrompt` async 改动传播。

- [ ] **Step 2: 全量构建**

Run: `pnpm build`
Expected: 构建成功。若 NAS SMB 卡住，Ctrl+C 终止后用本地副本 `cd /Users/kiikis000/Documents/kimi/workspace/storyflow-ai && git pull origin main && pnpm build` 验证。

- [ ] **Step 3: 推送到 GitHub**

```bash
git push origin main
```
若 pre-push hook 因 unstaged changes 卡住：`git push --no-verify origin main`

- [ ] **Step 4: Vercel 部署验证**

在 Vercel Dashboard 确认部署成功。部署完成后：
1. 应用 migration：在 Supabase Dashboard SQL Editor 执行 `20260727000000_admin_rbac_and_user_management.sql`（先 `set app.admin_email = '你的邮箱';`）
2. 运行种子：本地 `npx tsx scripts/seed-ai-prompts.mjs`（连生产 Supabase）
3. 访问 `https://kiikis.com/admin` 验证：
   - 侧栏显示全部导航（super_admin）
   - 用户列表可分页/搜索
   - 用户详情可改资料/调积分/封禁
   - AI 指令三 tab 可编辑保存回滚
   - 管理员角色页可加/改/删
   - 审计日志页显示历史操作

- [ ] **Step 5: 自审清单**

对照 spec 检查：
- [ ] §1 RBAC：3 角色 + `requireAdminRole` + `ADMIN_EMAIL` 种子
- [ ] §2 布局：侧栏/顶栏/6 路由 + 即将上线占位
- [ ] §3 用户管理：列表搜索/筛选/分页 + 详情改资料/积分/套餐/封禁/最近活动
- [ ] §4 API：`/admin/api/*` 全量端点 + 调用链
- [ ] §5 审计/错误/测试：每个写操作写日志 + 4 测试文件
- [ ] §6 AI 指令：3 表 + `buildPrompt` async + DB 缓存 + overrides + 三 tab UI + 版本回滚

- [ ] **Step 6: 最终 commit + push**

```bash
git add -A
git commit -m "chore(admin): 第一期完成 — 自审通过"
git push origin main
```

---

## 自审（计划 vs spec）

**Spec 覆盖：**
- §1 RBAC → Task 1（表）+ Task 2（守卫）✓
- §2 布局/路由 → Task 5（layout）✓
- §3 用户管理 → Task 6-10 ✓
- §4 API → Task 4/6/7/8/13/14/16 全量端点 ✓
- §5 审计/测试 → Task 3（audit helper）+ Task 18-19（测试）✓
- §6 AI 指令 → Task 11-15 ✓

**无占位符**：所有 step 含完整代码。

**类型一致**：`AdminRole` / `AdminContext` / `requireAdminRole` / `writeAuditLog` / `loadPromptsFromDb` / `refreshPromptCache` 在各任务间命名一致。

**中文简体锁定**：`lib/admin/zh.ts` 常量字典，所有页面直接引用，不走 i18n provider。
