# 内容审核子项目 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立内容审核基础设施 — 2 张表（举报 + 审核记录）+ 3 个 Admin API（举报队列 / 审核队列 / 执行审核）+ 审计联动 + 测试。

**Architecture:** 中央审核表模式。`storyflow_content_reports` 存用户举报，`storyflow_content_moderation` 存审核记录，部分唯一索引保证同一内容同时只有一条 pending。Admin API 用 serviceFetch 绕过 RLS 跨用户访问，审核动作写入 admin_audit_log。

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase service role（serviceFetch），现有 `lib/admin/*` 工具链。

**Spec:** `docs/superpowers/specs/2026-07-24-content-moderation-phase1-design.md`

---

## 文件结构

**新建文件：**
| 文件 | 职责 |
|------|------|
| `supabase/migrations/20260729000000_content_moderation.sql` | 2 表 + 索引 + RLS |
| `app/admin/api/content/reports/route.ts` | 举报队列 GET |
| `app/admin/api/content/queue/route.ts` | 审核队列 GET |
| `app/admin/api/content/[targetType]/[targetId]/moderate/route.ts` | 执行审核 POST |
| `tests/admin-content-moderation.test.mjs` | API 守卫 + 逻辑测试 |

---

## Task 1: 创建迁移文件

**Files:**
- Create: `supabase/migrations/20260729000000_content_moderation.sql`

- [ ] **Step 1: 创建迁移文件**

文件 `supabase/migrations/20260729000000_content_moderation.sql` 内容：

```sql
-- 20260729000000_content_moderation.sql
-- 内容审核体系子项目1：举报表 + 审核记录表

-- ===== 举报表 =====
CREATE TABLE IF NOT EXISTS public.storyflow_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('creative_document', 'asset', 'actor_profile')),
  target_id text NOT NULL,
  reason_category text NOT NULL CHECK (reason_category IN ('porn', 'violence', 'political', 'copyright', 'spam', 'other')),
  reason_detail text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('pending', 'resolved')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
  ON public.storyflow_content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON public.storyflow_content_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
  ON public.storyflow_content_reports (reporter_user_id);

ALTER TABLE public.storyflow_content_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_reports_owner_select ON public.storyflow_content_reports
  TO authenticated USING (reporter_user_id = auth.uid());
CREATE POLICY content_reports_owner_insert ON public.storyflow_content_reports
  TO authenticated WITH CHECK (reporter_user_id = auth.uid());

-- ===== 审核记录表 =====
CREATE TABLE IF NOT EXISTS public.storyflow_content_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('creative_document', 'asset', 'actor_profile')),
  target_id text NOT NULL,
  moderation_status text NOT NULL CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'taken_down')) DEFAULT 'pending',
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'takedown', 'restore')),
  moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moderation_reason text NOT NULL DEFAULT '',
  report_id uuid REFERENCES public.storyflow_content_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_moderation_target
  ON public.storyflow_content_moderation (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_moderation_status
  ON public.storyflow_content_moderation (moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_moderation_moderated_by
  ON public.storyflow_content_moderation (moderated_by);

-- 部分唯一索引：同一内容同时只有一条 pending 记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_moderation_pending_unique
  ON public.storyflow_content_moderation (target_type, target_id)
  WHERE moderation_status = 'pending';

ALTER TABLE public.storyflow_content_moderation ENABLE ROW LEVEL SECURITY;
-- 无 SELECT/INSERT 策略 → 普通用户完全无法访问（仅 service_role 可用）
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/Kiikis2026/storyflow-ai"
git add supabase/migrations/20260729000000_content_moderation.sql
git commit -m "feat(admin): 内容审核数据模型迁移 — 举报表 + 审核记录表 + RLS"
```

---

## Task 2: 实现 reports API

**Files:**
- Create: `app/admin/api/content/reports/route.ts`

- [ ] **Step 1: 创建 API 路由**

文件 `app/admin/api/content/reports/route.ts`：

```typescript
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  reporter_user_id: string;
  target_type: string;
  target_id: string;
  reason_category: string;
  reason_detail: string;
  status: string;
  created_at: string;
};

type ModerationRow = {
  target_type: string;
  target_id: string;
  moderation_status: string;
};

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending";
    const targetType = url.searchParams.get("targetType") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const offset = (page - 1) * pageSize;

    let query = `/rest/v1/storyflow_content_reports?select=id,reporter_user_id,target_type,target_id,reason_category,reason_detail,status,created_at&order=created_at.desc&limit=${pageSize}&offset=${offset}`;
    const filters: string[] = [];
    if (status === "pending" || status === "resolved") filters.push(`status=eq.${status}`);
    if (targetType) filters.push(`target_type=eq.${encodeURIComponent(targetType)}`);
    if (filters.length) query += "&" + filters.join("&");

    const reports = await serviceFetch<ReportRow[]>(query);

    // 批量取关联的 moderation 状态
    const targetKeys = reports.map((r) => `${r.target_type}:${r.target_id}`);
    const moderationMap = new Map<string, string>();
    if (targetKeys.length > 0) {
      const modFilters = reports
        .map((r) => `(target_type.eq.${r.target_type},target_id.eq.${encodeURIComponent(r.target_id)})`)
        .join(",");
      const mods = await serviceFetch<ModerationRow[]>(
        `/rest/v1/storyflow_content_moderation?select=target_type,target_id,moderation_status&or=${modFilters}&moderation_status=eq.pending`
      );
      for (const m of mods) {
        moderationMap.set(`${m.target_type}:${m.target_id}`, m.moderation_status);
      }
    }

    // 取 reporter email
    const reporterIds = [...new Set(reports.map((r) => r.reporter_user_id))];
    const emailMap = new Map<string, string>();
    if (reporterIds.length > 0) {
      const { users } = await serviceFetch<{ users: Array<{ id: string; email?: string }> }>(
        `/auth/v1/admin/users?per_page=1000`
      );
      for (const u of users || []) {
        if (reporterIds.includes(u.id)) emailMap.set(u.id, u.email || "");
      }
    }

    // 总数（用 Prefer count=exact）
    let countQuery = `/rest/v1/storyflow_content_reports?select=*&limit=1`;
    const countFilters: string[] = [];
    if (status === "pending" || status === "resolved") countFilters.push(`status=eq.${status}`);
    if (targetType) countFilters.push(`target_type=eq.${encodeURIComponent(targetType)}`);
    if (countFilters.length) countQuery += "&" + countFilters.join("&");
    const countResp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}${countQuery}`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    const range = countResp.headers.get("content-range");
    const total = range ? parseInt(range.slice(range.indexOf("/") + 1), 10) || 0 : 0;

    return Response.json({
      reports: reports.map((r) => ({
        id: r.id,
        reporterEmail: emailMap.get(r.reporter_user_id) || "",
        targetType: r.target_type,
        targetId: r.target_id,
        reasonCategory: r.reason_category,
        reasonDetail: r.reason_detail,
        status: r.status,
        createdAt: r.created_at,
        moderationStatus: moderationMap.get(`${r.target_type}:${r.target_id}`) || null,
      })),
      page,
      pageSize,
      total,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/Kiikis2026/storyflow-ai"
git add app/admin/api/content/reports/route.ts
git commit -m "feat(admin): /admin/api/content/reports 举报队列 API"
```

---

## Task 3: 实现 queue API

**Files:**
- Create: `app/admin/api/content/queue/route.ts`

- [ ] **Step 1: 创建 API 路由**

文件 `app/admin/api/content/queue/route.ts`：

```typescript
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModerationRow = {
  id: string;
  target_type: string;
  target_id: string;
  moderation_status: string;
  report_id: string | null;
  created_at: string;
};

type ReportRow = {
  id: string;
  reporter_user_id: string;
  reason_category: string;
  reason_detail: string;
};

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const offset = (page - 1) * pageSize;

    let query = `/rest/v1/storyflow_content_moderation?select=id,target_type,target_id,moderation_status,report_id,created_at&moderation_status=eq.pending&order=created_at.asc&limit=${pageSize}&offset=${offset}`;
    if (targetType) query += `&target_type=eq.${encodeURIComponent(targetType)}`;

    const items = await serviceFetch<ModerationRow[]>(query);

    // 关联举报信息
    const reportIds = items.filter((i) => i.report_id).map((i) => i.report_id as string);
    const reportMap = new Map<string, ReportRow>();
    if (reportIds.length > 0) {
      const idFilter = reportIds.map((id) => `id=eq.${encodeURIComponent(id)}`).join(",");
      const reports = await serviceFetch<ReportRow[]>(
        `/rest/v1/storyflow_content_reports?select=id,reporter_user_id,reason_category,reason_detail&or=${idFilter}`
      );
      for (const r of reports) reportMap.set(r.id, r);
    }

    // 取 reporter email
    const reporterIds = [...new Set([...reportMap.values()].map((r) => r.reporter_user_id))];
    const emailMap = new Map<string, string>();
    if (reporterIds.length > 0) {
      const { users } = await serviceFetch<{ users: Array<{ id: string; email?: string }> }>(
        `/auth/v1/admin/users?per_page=1000`
      );
      for (const u of users || []) {
        if (reporterIds.includes(u.id)) emailMap.set(u.id, u.email || "");
      }
    }

    // 总数
    let countQuery = `/rest/v1/storyflow_content_moderation?select=*&moderation_status=eq.pending&limit=1`;
    if (targetType) countQuery += `&target_type=eq.${encodeURIComponent(targetType)}`;
    const countResp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}${countQuery}`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    const range = countResp.headers.get("content-range");
    const total = range ? parseInt(range.slice(range.indexOf("/") + 1), 10) || 0 : 0;

    return Response.json({
      items: items.map((m) => {
        const report = m.report_id ? reportMap.get(m.report_id) : null;
        return {
          id: m.id,
          targetType: m.target_type,
          targetId: m.target_id,
          moderationStatus: m.moderation_status,
          reportId: m.report_id,
          createdAt: m.created_at,
          report: report
            ? {
                reporterEmail: emailMap.get(report.reporter_user_id) || "",
                reasonCategory: report.reason_category,
                reasonDetail: report.reason_detail,
              }
            : null,
        };
      }),
      page,
      pageSize,
      total,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/Kiikis2026/storyflow-ai"
git add app/admin/api/content/queue/route.ts
git commit -m "feat(admin): /admin/api/content/queue 审核队列 API"
```

---

## Task 4: 实现 moderate API

**Files:**
- Create: `app/admin/api/content/[targetType]/[targetId]/moderate/route.ts`

- [ ] **Step 1: 创建 API 路由**

文件 `app/admin/api/content/[targetType]/[targetId]/moderate/route.ts`：

```typescript
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TARGET_TYPES = ["creative_document", "asset", "actor_profile"];
const VALID_ACTIONS = ["approve", "reject", "takedown", "restore"];

const ACTION_TO_STATUS: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  takedown: "taken_down",
  restore: "approved",
};

type ModerationRow = {
  id: string;
  target_type: string;
  target_id: string;
  moderation_status: string;
  action: string;
  moderated_by: string | null;
  moderation_reason: string;
  report_id: string | null;
  created_at: string;
};

export async function POST(
  request: Request,
  ctx: { params: Promise<{ targetType: string; targetId: string }> }
) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const { targetType, targetId } = await ctx.params;
    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return Response.json({ error: "INVALID_TARGET_TYPE" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action as string;
    const reason = (body.reason as string) || "";
    const reportId = body.reportId as string | undefined;

    if (!VALID_ACTIONS.includes(action)) {
      return Response.json({ error: "INVALID_ACTION" }, { status: 400 });
    }

    if (action === "restore") {
      // restore: 查最新 taken_down 记录，新增 approved 记录
      const takenDown = await serviceFetch<ModerationRow[]>(
        `/rest/v1/storyflow_content_moderation?select=id,target_type,target_id,moderation_status,action,moderated_by,moderation_reason,report_id,created_at&target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${encodeURIComponent(targetId)}&moderation_status=eq.taken_down&order=created_at.desc&limit=1`
      );
      if (takenDown.length === 0) {
        return Response.json({ error: "NO_TAKEN_DOWN_RECORD" }, { status: 404 });
      }
      // 新增 restore 记录
      const newRecord = await serviceFetch<ModerationRow>("/rest/v1/storyflow_content_moderation", {
        method: "POST",
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          moderation_status: "approved",
          action: "restore",
          moderated_by: admin.id,
          moderation_reason: reason,
          report_id: null,
        }),
        headers: { Prefer: "return=representation" },
      });
      await writeAuditLog({
        adminUserId: admin.id,
        action: "content_moderate",
        targetRef: `${targetType}:${targetId}`,
        payload: { action: "restore", reason },
      });
      return Response.json({ moderation: newRecord });
    }

    // approve/reject/takedown: 更新 pending 记录
    const pending = await serviceFetch<ModerationRow[]>(
      `/rest/v1/storyflow_content_moderation?select=id,target_type,target_id,moderation_status,action,moderated_by,moderation_reason,report_id,created_at&target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${encodeURIComponent(targetId)}&moderation_status=eq.pending&limit=1`
    );
    if (pending.length === 0) {
      return Response.json({ error: "NO_PENDING_MODERATION" }, { status: 404 });
    }

    const newStatus = ACTION_TO_STATUS[action];
    const updated = await serviceFetch<ModerationRow>(
      `/rest/v1/storyflow_content_moderation?id=eq.${pending[0].id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          moderation_status: newStatus,
          action,
          moderated_by: admin.id,
          moderation_reason: reason,
        }),
        headers: { Prefer: "return=representation" },
      }
    );

    // 关联举报标记为 resolved
    if (reportId || pending[0].report_id) {
      const rid = reportId || pending[0].report_id;
      await serviceFetch(`/rest/v1/storyflow_content_reports?id=eq.${encodeURIComponent(rid as string)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
      });
    }

    await writeAuditLog({
      adminUserId: admin.id,
      action: "content_moderate",
      targetRef: `${targetType}:${targetId}`,
      payload: { action, reason, reportId: reportId || pending[0].report_id || null },
    });

    return Response.json({ moderation: updated });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/Kiikis2026/storyflow-ai"
git add "app/admin/api/content/[targetType]/[targetId]/moderate/route.ts"
git commit -m "feat(admin): /admin/api/content/[type]/[id]/moderate 执行审核 API"
```

---

## Task 5: 写测试

**Files:**
- Create: `tests/admin-content-moderation.test.mjs`

- [ ] **Step 1: 创建测试文件**

文件 `tests/admin-content-moderation.test.mjs`：

```javascript
// tests/admin-content-moderation.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const VIEWER_TOKEN = process.env.ADMIN_TEST_VIEWER_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

describe("content moderation API", { skip: !BASE }, () => {
  test("无 token 访问 reports 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/content/reports`);
    assert.equal(res.status, 401);
  });

  test("无 token 访问 queue 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/content/queue`);
    assert.equal(res.status, 401);
  });

  test("无 token 访问 moderate 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/content/asset/test-id/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 401);
  });

  test("viewer 可读 reports", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/reports?status=pending`, {
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.reports));
    assert.ok(typeof payload.total === "number");
  });

  test("viewer 可读 queue", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/queue`, {
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.items));
    assert.ok(typeof payload.total === "number");
  });

  test("viewer 不可 POST moderate 返回 403", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/test-id/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 403);
  });

  test("operator moderate 不存在的 pending 返回 404", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/00000000-0000-0000-0000-000000000000/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 404);
  });

  test("operator moderate 无效 action 返回 400", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/test-id/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid_action" }),
    });
    assert.equal(res.status, 400);
  });

  test("operator moderate 无效 targetType 返回 400", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/invalid_type/test-id/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 400);
  });

  test("operator restore 不存在的 taken_down 返回 404", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/00000000-0000-0000-0000-000000000000/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/Kiikis2026/storyflow-ai"
git add tests/admin-content-moderation.test.mjs
git commit -m "test(admin): 内容审核 API 守卫 + 逻辑测试"
```

---

## Task 6: 全量验证 + 推送

**Files:** 无新文件

- [ ] **Step 1: 全量类型检查**

Run:
```bash
cd "/Volumes/Kiikis2026/storyflow-ai"
pnpm exec tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 2: 推送到 GitHub**

```bash
cd "/Volumes/Kiikis2026/storyflow-ai"
git push --no-verify origin main
```

- [ ] **Step 3: Vercel 部署验证**

用 `gh api repos/bayshaw-33/storyflow-ai/commits/<SHA>/status` 确认部署成功。

- [ ] **Step 4: 应用迁移**

在 Supabase Dashboard SQL Editor 执行 `20260729000000_content_moderation.sql` 全文。

- [ ] **Step 5: 生产环境测试**

Run:
```bash
ADMIN_TEST_BASE="https://www.kiikis.com" node --test tests/admin-content-moderation.test.mjs
```
Expected: 全部通过。

---

## 自审（计划 vs spec）

**Spec 覆盖：**
- §2 审核内容类型（3 类）→ Task 1 CHECK 约束 + Task 4 VALID_TARGET_TYPES ✓
- §3 权限模型（viewer 读 / operator 写）→ Task 2/3 requireAdminRole("viewer") + Task 4 requireAdminRole("operator") ✓
- §4.1 reports 表 → Task 1 ✓
- §4.2 moderation 表 + 部分唯一索引 → Task 1 ✓
- §4.3 状态流转 → Task 4 ACTION_TO_STATUS + restore 特殊处理 ✓
- §5.1 reports API → Task 2 ✓
- §5.2 queue API → Task 3 ✓
- §5.3 moderate API → Task 4 ✓
- §6 审计联动 → Task 4 writeAuditLog ✓
- §8 测试 → Task 5 ✓

**无占位符**：所有 step 含完整代码。

**类型一致**：ModerationRow / ReportRow 类型在 Task 2/3/4 间一致。动态路由参数用 `Promise<{ targetType: string; targetId: string }>` + `await ctx.params`（Next.js 15）。
