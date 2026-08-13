-- ============================================================
-- KIIKIS 2.1 Phase 1 Foundation: Creative Events + RLS
-- 需求: K21-EV-001..005, K21-DB-001..003
-- 日期: 2026-08-27
-- 性质: forward-only, 只新增, 不修改 baseline 或既有表
-- ============================================================

-- 禁止事务内回滚已提交对象；本 migration 应在空事务或显式事务中执行
-- 不修改 20260716000000_baseline.sql 或任何既有 migration 文件

-- ============================================================
-- 1. storyflow_creative_events 表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_creative_events (
  id uuid primary key default gen_random_uuid(),
  -- 单调递增序列，断点补拉用 (K21-EV-003)
  sequence bigint generated always as identity,
  event_type text not null,
  -- 契约版本，必须正整数 (K21-EV-001)
  schema_version integer not null check (schema_version > 0),
  -- actor 来源：系统或真实用户
  actor_type text not null check (actor_type in ('user', 'system')),
  -- actorType=user 时必填；system 时为 null
  actor_id uuid null references auth.users(id) on delete set null,
  -- 资源所有者，权限根 (K21-DB-002)
  owner_id uuid not null references auth.users(id) on delete restrict,
  resource_type text not null,
  resource_id text not null,
  resource_version text null,
  task_id uuid null,
  -- 稳定幂等键 (K21-EV-004)
  idempotency_key text not null,
  -- 可见性分级：private 仅 owner，collaborators 留给 Phase 4 grant 表 join，public 对所有可见
  visibility text not null check (visibility in ('private', 'collaborators', 'public')),
  -- payload 默认空对象，禁止 null (K21-EV-005 由应用层 parseCreativeEvent 拒敏字段)
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- 同一 owner 下幂等键唯一 (K21-EV-004)
  unique (owner_id, idempotency_key)
);

COMMENT ON TABLE public.storyflow_creative_events IS
  'KIIKIS 2.1 append-only Creative Event 流。只允许 INSERT/SELECT，禁止 UPDATE/DELETE。';
COMMENT ON COLUMN public.storyflow_creative_events.sequence IS
  '单调递增，支持断点补拉 (K21-EV-003)。GENERATED ALWAYS AS IDENTITY，不可手动写入。';
COMMENT ON COLUMN public.storyflow_creative_events.visibility IS
  'private=仅 owner; collaborators=Phase 4 grant 表 join 后扩展; public=对所有 authenticated 可见。';

-- ============================================================
-- 2. 索引
-- ============================================================

-- 断点补拉：按 owner 顺序读取 sequence > afterSequence
CREATE INDEX IF NOT EXISTS storyflow_creative_events_owner_sequence_idx
  ON public.storyflow_creative_events(owner_id, sequence);

-- 按资源过滤
CREATE INDEX IF NOT EXISTS storyflow_creative_events_resource_idx
  ON public.storyflow_creative_events(resource_type, resource_id, sequence);

-- 按 task 过滤
CREATE INDEX IF NOT EXISTS storyflow_creative_events_task_idx
  ON public.storyflow_creative_events(task_id, sequence)
  WHERE task_id IS NOT NULL;

-- ============================================================
-- 3. Row Level Security
-- ============================================================

ALTER TABLE public.storyflow_creative_events ENABLE ROW LEVEL SECURITY;
-- FORCE 确保即使 table owner 也受 RLS 约束；service_role 仍绕过 (用于 trigger 防御)
ALTER TABLE public.storyflow_creative_events FORCE ROW LEVEL SECURITY;

-- 3.1 SELECT: owner 看到自己所有 visibility 的事件
DROP POLICY IF EXISTS storyflow_creative_events_owner_select ON public.storyflow_creative_events;
CREATE POLICY storyflow_creative_events_owner_select
  ON public.storyflow_creative_events FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()));

-- 3.2 SELECT: 其他 authenticated 用户只能看 public (collaborators 在 Phase 4 接入 grant 表后扩展)
DROP POLICY IF EXISTS storyflow_creative_events_public_select ON public.storyflow_creative_events;
CREATE POLICY storyflow_creative_events_public_select
  ON public.storyflow_creative_events FOR SELECT TO authenticated
  USING (visibility = 'public');

-- 3.3 INSERT: 只能以 auth.uid() 作为 owner_id 写入
DROP POLICY IF EXISTS storyflow_creative_events_owner_insert ON public.storyflow_creative_events;
CREATE POLICY storyflow_creative_events_owner_insert
  ON public.storyflow_creative_events FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));

-- 不创建 UPDATE / DELETE policy：默认拒绝。
-- service_role 绕过 RLS，用下面的 guard trigger 额外防御。

-- ============================================================
-- 4. Guard Trigger: 阻止 UPDATE / DELETE (防御 service_role 误操作)
-- ============================================================

CREATE OR REPLACE FUNCTION public.storyflow_creative_events_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'storyflow_creative_events is append-only: % not allowed (event id=%, sequence=%)',
    TG_OP, COALESCE(OLD.id::text, NEW.id::text), COALESCE(OLD.sequence::text, NEW.sequence::text);
END;
$$;

DROP TRIGGER IF EXISTS storyflow_creative_events_immutable_guard ON public.storyflow_creative_events;
CREATE TRIGGER storyflow_creative_events_immutable_guard
  BEFORE UPDATE OR DELETE ON public.storyflow_creative_events
  FOR EACH ROW EXECUTE FUNCTION public.storyflow_creative_events_immutable_guard();

-- ============================================================
-- 5. Realtime publication: 只添加目标表，不开放无关表 (K21-EV-001)
-- ============================================================

-- 仅把 storyflow_creative_events 加入 supabase_realtime
-- 不在此 migration 中为其他表添加 realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.storyflow_creative_events;

-- ============================================================
-- 6. 窄 RPC: append_creative_event (K21-EV-002)
-- 事件写入与幂等合并通过单一 RPC 在 DB 事务内完成。
-- 不接受"两次 fetch 大概率成功"的模式。
-- SECURITY INVOKER 让 RLS 校验调用者权限 (owner_id 必须匹配 auth.uid())。
-- ============================================================

CREATE OR REPLACE FUNCTION public.append_creative_event(
  p_event_type text,
  p_schema_version integer,
  p_actor_type text,
  p_actor_id uuid,
  p_owner_id uuid,
  p_resource_type text,
  p_resource_id text,
  p_resource_version text,
  p_task_id uuid,
  p_idempotency_key text,
  p_visibility text,
  p_payload jsonb,
  p_occurred_at timestamptz
) RETURNS public.storyflow_creative_events
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_row public.storyflow_creative_events;
BEGIN
  INSERT INTO public.storyflow_creative_events (
    event_type, schema_version, actor_type, actor_id, owner_id,
    resource_type, resource_id, resource_version, task_id,
    idempotency_key, visibility, payload, occurred_at
  ) VALUES (
    p_event_type, p_schema_version, p_actor_type, p_actor_id, p_owner_id,
    p_resource_type, p_resource_id, p_resource_version, p_task_id,
    p_idempotency_key, p_visibility, COALESCE(p_payload, '{}'::jsonb), p_occurred_at
  )
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    -- 幂等：相同 (owner_id, idempotency_key) 已存在时返回已有行
    SELECT * INTO v_row FROM public.storyflow_creative_events
    WHERE owner_id = p_owner_id AND idempotency_key = p_idempotency_key
    LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

-- 仅授权给 authenticated 角色调用；service_role 继承绕过 RLS 但不应直接调用此 RPC
REVOKE EXECUTE ON FUNCTION public.append_creative_event(
  text, integer, text, uuid, uuid, text, text, text, uuid, text, text, jsonb, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_creative_event(
  text, integer, text, uuid, uuid, text, text, text, uuid, text, text, jsonb, timestamptz
) TO authenticated;
