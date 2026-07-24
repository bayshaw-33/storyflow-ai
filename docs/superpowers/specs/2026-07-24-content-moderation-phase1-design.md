# 内容审核体系子项目 1 设计：审核数据模型 + 基础 API

- **日期**：2026-07-24
- **范围**：内容审核体系子项目 1 — 数据模型 + Admin API（基础设施层）
- **后续子项目**：2（用户端举报 UI）、3（后台审核 UI）、4（AI 自动检测）
- **方案**：中央审核表 + 3 个 Admin API + 审计联动

---

## 1. 目标

为 kiikis.com 建立内容审核基础设施：数据模型（举报表 + 审核记录表）+ Admin API（举报队列 / 审核队列 / 执行审核动作）+ 审计联动。本期是后续审核 UI 和 AI 检测的地基，不含前端页面。

**非目标**：用户端举报 UI（子项目 2）、后台审核 UI 页面（子项目 3）、内容可见性改造（下架内容对用户不可见，子项目 3）、AI 自动检测（子项目 4）。

---

## 2. 审核内容类型

MVP 阶段纳入 3 类内容：

| target_type | 对应内容表 | 内容说明 |
|-------------|-----------|----------|
| `creative_document` | `storyflow_creative_document_versions` | AI 生成小说/剧本/世界观文本 |
| `asset` | `storyflow_assets` | AI 生成图片/视频资产 |
| `actor_profile` | `storyflow_actor_profiles` | 用户创建的 AI 演员档案 |

后续可扩展（projects/episodes/scenes/characters 等），本期聚焦核心 3 类。

---

## 3. 权限模型

| 操作 | 最低角色 | 说明 |
|------|----------|------|
| 查看举报队列 / 审核队列 | viewer | 与现有 admin 一致，只读可看 |
| 执行审核动作（通过/拒绝/下架/恢复） | **operator** | 写操作需 operator+，viewer 不可 |
| 查看审计日志中的审核记录 | super_admin | 与现有审计日志权限一致 |

API 侧 `requireAdminRole` 强制校验。

---

## 4. 数据模型

### 4.1 `storyflow_content_reports`（用户举报表）

```sql
CREATE TABLE public.storyflow_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('creative_document', 'asset', 'actor_profile')),
  target_id text NOT NULL,
  reason_category text NOT NULL CHECK (reason_category IN ('porn', 'violence', 'political', 'copyright', 'spam', 'other')),
  reason_detail text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('pending', 'resolved')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX idx_content_reports_status_created ON public.storyflow_content_reports (status, created_at DESC);
CREATE INDEX idx_content_reports_target ON public.storyflow_content_reports (target_type, target_id);
CREATE INDEX idx_content_reports_reporter ON public.storyflow_content_reports (reporter_user_id);

-- RLS：用户只能看自己提交的举报；管理员通过 service_role 绕过
ALTER TABLE public.storyflow_content_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_reports_owner_select ON public.storyflow_content_reports
  TO authenticated USING (reporter_user_id = auth.uid());
CREATE POLICY content_reports_owner_insert ON public.storyflow_content_reports
  TO authenticated WITH CHECK (reporter_user_id = auth.uid());
```

### 4.2 `storyflow_content_moderation`（审核记录表）

```sql
CREATE TABLE public.storyflow_content_moderation (
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

-- 索引
CREATE INDEX idx_content_moderation_target ON public.storyflow_content_moderation (target_type, target_id);
CREATE INDEX idx_content_moderation_status ON public.storyflow_content_moderation (moderation_status, created_at DESC);
CREATE INDEX idx_content_moderation_moderated_by ON public.storyflow_content_moderation (moderated_by);

-- 部分唯一索引：同一内容同时只有一条 pending 记录（防止重复审核）
CREATE UNIQUE INDEX idx_content_moderation_pending_unique
  ON public.storyflow_content_moderation (target_type, target_id)
  WHERE moderation_status = 'pending';

-- RLS：管理员通过 service_role 绕过；普通用户不可直接访问
ALTER TABLE public.storyflow_content_moderation ENABLE ROW LEVEL SECURITY;
-- 无 SELECT/INSERT 策略 → 普通用户完全无法访问（只能通过 admin API）
```

### 4.3 状态流转

```
用户举报 → 
  reports: status=pending
  moderation: status=pending, action=<空>, report_id=<report.id>

管理员审核 →
  approve（通过）:
    旧 moderation: status=approved, action=approve
    reports: status=resolved
  reject（驳回举报）:
    旧 moderation: status=rejected, action=reject
    reports: status=resolved
  takedown（下架内容）:
    旧 moderation: status=taken_down, action=takedown
    reports: status=resolved
  restore（恢复下架内容）:
    新增 moderation: status=approved, action=restore
    （此时无关联 report，report_id=null）
```

**关键规则**：
- 审核动作直接更新 pending moderation 记录的 status 和 action 字段（不追加新行）
- restore 是例外：因为 pending 记录已 closed（status=taken_down），需新增一条 approved 记录
- 同一内容同时只有一条 pending 记录（部分唯一索引保证）

---

## 5. Admin API 设计

### 5.1 `GET /admin/api/content/reports`

举报队列列表。

**权限**：viewer+

**查询参数**：
- `status` (pending | resolved，默认 pending)
- `targetType` (creative_document | asset | actor_profile，可选)
- `page` (默认 1)
- `pageSize` (默认 50，最大 200)

**响应**：
```typescript
{
  reports: {
    id: string;
    reporterEmail: string;  // 从 auth.users 关联
    targetType: string;
    targetId: string;
    reasonCategory: string;
    reasonDetail: string;
    status: string;
    createdAt: string;
    // 关联的审核状态（如有）
    moderationStatus: string | null;
  }[];
  page: number;
  pageSize: number;
  total: number;
}
```

**实现**：
- serviceFetch 查 reports 表 + 关联 auth.users 取 reporter email
- 关联 moderation 表取当前审核状态
- 按 created_at DESC 排序

### 5.2 `GET /admin/api/content/queue`

审核队列（moderation status=pending 的记录）。

**权限**：viewer+

**查询参数**：
- `targetType` (可选)
- `page` / `pageSize`

**响应**：
```typescript
{
  items: {
    id: string;  // moderation 记录 id
    targetType: string;
    targetId: string;
    moderationStatus: string;
    reportId: string | null;
    createdAt: string;
    // 关联举报信息（如有）
    report: {
      reporterEmail: string;
      reasonCategory: string;
      reasonDetail: string;
    } | null;
  }[];
  page: number;
  pageSize: number;
  total: number;
}
```

**实现**：
- serviceFetch 查 moderation 表 WHERE status=pending
- LEFT JOIN reports 取举报信息（主动巡查时 report_id 为 null）

### 5.3 `POST /admin/api/content/[targetType]/[targetId]/moderate`

执行审核动作。

**权限**：operator+

**请求体**：
```typescript
{
  action: 'approve' | 'reject' | 'takedown' | 'restore';
  reason?: string;  // 管理员理由
  reportId?: string;  // 关联举报 ID（如来自举报队列）
}
```

**逻辑**：
1. 查 moderation 表 WHERE target_type=X AND target_id=Y AND status='pending'
2. 若无 pending 记录且 action≠restore → 404（无待审核内容）
3. 若有 pending 记录且 action=restore → 400（restore 只能对 taken_down 内容）
4. 更新 moderation 记录：moderation_status + action + moderated_by + moderation_reason
5. 若有关联 report → 更新 report.status=resolved
6. 写审计日志：`writeAuditLog({ action: 'content_moderate', targetRef: '${targetType}:${targetId}', payload: { action, reason } })`
7. 返回更新后的 moderation 记录

**响应**：
```typescript
{
  moderation: {
    id: string;
    targetType: string;
    targetId: string;
    moderationStatus: string;
    action: string;
    moderatedBy: string;
    moderationReason: string;
    createdAt: string;
  };
}
```

**restore 特殊处理**：
- 查 moderation WHERE target_type=X AND target_id=Y AND status='taken_down' ORDER BY created_at DESC LIMIT 1
- 若无 → 404
- 新增 moderation 记录：status=approved, action=restore, moderated_by, reason

---

## 6. 审计联动

所有审核动作写入 `storyflow_admin_audit_log`：
- `action`: `'content_moderate'`
- `target_user_id`: null（审核的是内容，不是用户）
- `target_ref`: `'${targetType}:${targetId}'`（如 `'asset:abc-123'`）
- `payload`: `{ action, reason, reportId }`

---

## 7. 迁移文件

单一迁移文件 `20260729000000_content_moderation.sql`：
- 创建 2 张表
- 创建索引（3+3+1 部分唯一）
- 启用 RLS + 创建策略
- 无数据迁移（新表）

---

## 8. 测试

`tests/admin-content-moderation.test.mjs`：
- 无 token 访问 3 个 API → 401
- viewer 可读 reports/queue，不可 POST moderate → 403
- operator 可 POST moderate
- moderate 逻辑验证：approve/reject/takedown/restore 状态流转
- restore 对非 taken_down 内容 → 400
- moderate 不存在的 pending → 404

---

## 9. 实施顺序（writing-plans 细化）

1. 创建迁移文件（2 表 + 索引 + RLS）
2. 实现 `/admin/api/content/reports` GET
3. 实现 `/admin/api/content/queue` GET
4. 实现 `/admin/api/content/[targetType]/[targetId]/moderate` POST
5. 写测试
6. tsc + commit + push
7. Supabase 执行迁移
8. 生产环境验证

---

## 10. 风险

| 风险 | 缓解 |
|------|------|
| target_id 类型不匹配（uuid vs text） | 统一用 text，兼容不同内容表的主键类型 |
| 部分唯一索引在并发举报下冲突 | 举报创建时不写 moderation，仅审核动作时写；首个审核动作创建 pending 记录 |
| restore 逻辑复杂（需查历史） | 明确查最新 taken_down 记录，若无则 404 |
| 后台审核 UI 尚未存在 | 本期只提供 API，UI 在子项目 3 实现；API 可独立验证 |
