-- ============================================================
-- KIIKIS 2.1 Phase 2: Screenplay Handoffs (不可变快照)
-- 需求: K21-HO-001..004
-- 日期: 2026-08-27
-- 性质: forward-only, 只新增, 不修改 baseline 或既有表
-- ============================================================

-- 不修改 20260716000000_baseline.sql 或任何既有 migration 文件

-- ============================================================
-- 1. storyflow_screenplay_handoffs 表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_screenplay_handoffs (
  id uuid primary key default gen_random_uuid(),
  -- 所有者 (RLS 根)
  owner_id uuid not null references auth.users(id) on delete restrict,
  -- 项目/Universe/单集引用 (稳定 ID, K21-HO-002)
  project_id text not null,
  universe_id text not null,
  episode_id text not null,
  episode_no integer not null check (episode_no > 0),
  episode_title text not null,
  -- 源单元版本 (K21-HO-003: 上游修改创建新 handoff)
  source_unit_id text not null,
  source_version text not null,
  -- 源内容 hash, 用于幂等创建 (K21-HO-004)
  source_hash text not null,
  -- 固定 9:16 (K21-HO-001)
  aspect_ratio text not null check (aspect_ratio = '9:16'),
  -- 剧本格式与语言
  screenplay_format text not null check (screenplay_format in ('international_production', 'hollywood_spec', 'asian_production')),
  screenplay_language text not null,
  dialogue_language text not null,
  -- Canon 快照 (角色/场景/道具母版版本, K21-HO-002)
  canon_snapshot jsonb not null,
  -- 场景列表 (结构化 JSON, 事实源)
  content_json jsonb not null,
  -- 确认人 (创建时 null, 确认后填充)
  confirmed_by uuid null references auth.users(id) on delete set null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  -- 幂等: 同一 owner + source_hash 只允许一个 handoff (K21-HO-003)
  unique (owner_id, source_hash)
);

COMMENT ON TABLE public.storyflow_screenplay_handoffs IS
  'KIIKIS 2.1 不可变剧本 handoff 快照。只允许 INSERT/SELECT，禁止 UPDATE/DELETE (上游修改创建新行)。';

COMMENT ON COLUMN public.storyflow_screenplay_handoffs.source_hash IS
  '源内容 hash (K21-HO-004)。相同内容 → 相同 hash → 幂等创建。';

COMMENT ON COLUMN public.storyflow_screenplay_handoffs.content_json IS
  '结构化场景列表 (事实源)。禁止用自由 Markdown 作为下游事实源。';

-- ============================================================
-- 2. 索引
-- ============================================================

-- 按项目列出 handoff
CREATE INDEX IF NOT EXISTS storyflow_screenplay_handoffs_owner_project_idx
  ON public.storyflow_screenplay_handoffs(owner_id, project_id, created_at desc);

-- 按单集列出 (Production Workbench 跳转用)
CREATE INDEX IF NOT EXISTS storyflow_screenplay_handoffs_episode_idx
  ON public.storyflow_screenplay_handoffs(owner_id, episode_id, created_at desc);

-- 按 source_hash 幂等查找
CREATE INDEX IF NOT EXISTS storyflow_screenplay_handoffs_source_hash_idx
  ON public.storyflow_screenplay_handoffs(owner_id, source_hash);

-- ============================================================
-- 3. Row Level Security
-- ============================================================

ALTER TABLE public.storyflow_screenplay_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_screenplay_handoffs FORCE ROW LEVEL SECURITY;

-- 3.1 SELECT: owner 只能看自己的 handoff
DROP POLICY IF EXISTS storyflow_screenplay_handoffs_owner_select ON public.storyflow_screenplay_handoffs;
CREATE POLICY storyflow_screenplay_handoffs_owner_select
  ON public.storyflow_screenplay_handoffs FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()));

-- 3.2 INSERT: 只能以 auth.uid() 作为 owner_id 写入
DROP POLICY IF EXISTS storyflow_screenplay_handoffs_owner_insert ON public.storyflow_screenplay_handoffs;
CREATE POLICY storyflow_screenplay_handoffs_owner_insert
  ON public.storyflow_screenplay_handoffs FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));

-- 3.3 UPDATE: 仅允许 owner 更新 confirmed_by / confirmed_at (确认动作)
-- 其他字段 (content_json / source_hash / canon_snapshot 等) 不可变
DROP POLICY IF EXISTS storyflow_screenplay_handoffs_owner_confirm ON public.storyflow_screenplay_handoffs;
CREATE POLICY storyflow_screenplay_handoffs_owner_confirm
  ON public.storyflow_screenplay_handoffs FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

-- 不创建 DELETE policy：默认拒绝。

-- ============================================================
-- 4. Guard Trigger: 阻止 UPDATE 不可变字段 + 阻止 DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.storyflow_screenplay_handoffs_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'storyflow_screenplay_handoffs is immutable: DELETE not allowed (handoff id=%)', OLD.id;
  END IF;

  -- UPDATE: 只允许修改 confirmed_by / confirmed_at
  IF NEW.source_hash IS DISTINCT FROM OLD.source_hash
     OR NEW.content_json IS DISTINCT FROM OLD.content_json
     OR NEW.canon_snapshot IS DISTINCT FROM OLD.canon_snapshot
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.universe_id IS DISTINCT FROM OLD.universe_id
     OR NEW.episode_id IS DISTINCT FROM OLD.episode_id
     OR NEW.source_unit_id IS DISTINCT FROM OLD.source_unit_id
     OR NEW.source_version IS DISTINCT FROM OLD.source_version THEN
    RAISE EXCEPTION 'storyflow_screenplay_handoffs is immutable: only confirmed_by/confirmed_at may be updated (handoff id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storyflow_screenplay_handoffs_immutable_guard ON public.storyflow_screenplay_handoffs;
CREATE TRIGGER storyflow_screenplay_handoffs_immutable_guard
  BEFORE UPDATE OR DELETE ON public.storyflow_screenplay_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.storyflow_screenplay_handoffs_immutable_guard();

-- ============================================================
-- 5. 窄 RPC: create_screenplay_handoff (幂等创建, K21-HO-003)
-- 相同 source_hash → 返回已有行, 不创建新版本
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_screenplay_handoff(
  p_owner_id uuid,
  p_project_id text,
  p_universe_id text,
  p_episode_id text,
  p_episode_no integer,
  p_episode_title text,
  p_source_unit_id text,
  p_source_version text,
  p_source_hash text,
  p_aspect_ratio text,
  p_screenplay_format text,
  p_screenplay_language text,
  p_dialogue_language text,
  p_canon_snapshot jsonb,
  p_content_json jsonb
) RETURNS public.storyflow_screenplay_handoffs
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_row public.storyflow_screenplay_handoffs;
BEGIN
  INSERT INTO public.storyflow_screenplay_handoffs (
    owner_id, project_id, universe_id, episode_id, episode_no, episode_title,
    source_unit_id, source_version, source_hash, aspect_ratio,
    screenplay_format, screenplay_language, dialogue_language,
    canon_snapshot, content_json
  ) VALUES (
    p_owner_id, p_project_id, p_universe_id, p_episode_id, p_episode_no, p_episode_title,
    p_source_unit_id, p_source_version, p_source_hash, p_aspect_ratio,
    p_screenplay_format, p_screenplay_language, p_dialogue_language,
    p_canon_snapshot, p_content_json
  )
  ON CONFLICT (owner_id, source_hash) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    -- 幂等: 相同 source_hash 已存在, 返回已有行
    SELECT * INTO v_row FROM public.storyflow_screenplay_handoffs
    WHERE owner_id = p_owner_id AND source_hash = p_source_hash
    LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_screenplay_handoff(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_screenplay_handoff(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb
) TO authenticated;

-- ============================================================
-- 6. 窄 RPC: confirm_screenplay_handoff (确认, K21-HO-001)
-- 仅更新 confirmed_by / confirmed_at, 其他字段不可变
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_screenplay_handoff(
  p_handoff_id uuid,
  p_confirmed_by uuid
) RETURNS public.storyflow_screenplay_handoffs
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_row public.storyflow_screenplay_handoffs;
BEGIN
  UPDATE public.storyflow_screenplay_handoffs
  SET confirmed_by = p_confirmed_by, confirmed_at = now()
  WHERE id = p_handoff_id AND owner_id = p_confirmed_by
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM public.storyflow_screenplay_handoffs
    WHERE id = p_handoff_id AND owner_id = p_confirmed_by
    LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_screenplay_handoff(
  uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_screenplay_handoff(
  uuid, uuid
) TO authenticated;
