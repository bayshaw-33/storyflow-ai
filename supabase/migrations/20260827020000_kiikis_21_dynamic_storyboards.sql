-- ============================================================
-- KIIKIS 2.1 Phase 2: Dynamic Storyboards (版本化 + CAS + 锁定)
-- 需求: K21-SB-001..009 (尤其 K21-SB-007 锁定/人工编辑, K21-SB-008 CAS)
-- 日期: 2026-08-27
-- 性质: forward-only, 只新增, 不修改 baseline 或既有表
-- ============================================================

-- 设计要点:
--   1. 一个逻辑 storyboard = (owner_id, handoff_id, scene_id)
--   2. 每行是一个 revision; revision 单调递增; 当前版本 = max(revision)
--   3. append-only: 禁止 UPDATE/DELETE (guard trigger)
--   4. CAS: create_dynamic_storyboard_revision RPC 在事务内 advisory lock + 期望 revision 校验
--   5. frame.locked / frame.userEdited 在 RPC 内强制保留 (新 handoff 不能覆盖)
--   6. 冲突返回 NULL + 通过 OUT 参数返回 current_revision 供 API 层构造 409 diff

-- 不修改 20260716000000_baseline.sql 或任何既有 migration 文件

-- ============================================================
-- 1. storyflow_dynamic_storyboards 表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_dynamic_storyboards (
  id uuid primary key default gen_random_uuid(),
  -- 所有者 (RLS 根)
  owner_id uuid not null references auth.users(id) on delete restrict,
  -- 引用不可变 handoff (外键约束保证 storyboard 不会孤立)
  handoff_id uuid not null references public.storyflow_screenplay_handoffs(id) on delete restrict,
  -- 场景稳定 ID (来自 handoff.content_json.scenes[].id)
  scene_id text not null,

  -- 动态宫格契约字段 (与 dynamic-grid-contract.ts 对齐)
  schema_version text not null check (schema_version = 'kiikis.dynamic-grid-storyboard/1'),
  continuity_mode text not null check (continuity_mode in ('NEW', 'CONTINUOUS')),
  grid_count smallint not null check (grid_count in (4, 6, 9, 12)),
  grid_rationale text not null,
  spatial_plan jsonb not null,
  shared_cinematography text not null,
  negative_prompt text not null,
  -- frames_json 数组: 每个 frame 含 id/order/aspectRatio/visualDescription/characterIds/
  -- shotSize/cameraMovement/emotion/dialogue/action/timecode/locked/userEdited
  frames_json jsonb not null,
  -- frames_json 的稳定 hash, 用于幂等创建 (相同内容 → 相同 hash → 跳过)
  frames_hash text not null,

  -- 版本控制
  revision integer not null check (revision >= 0),
  parent_id uuid null references public.storyflow_dynamic_storyboards(id) on delete restrict,
  -- 来源: 'ai' (AI 初次/重新生成) | 'user' (人工编辑/锁定) | 'system' (导出修正)
  revision_source text not null check (revision_source in ('ai', 'user', 'system')),
  -- 是否为当前版本 (denormalized 优化: 避免每次 max(revision) 查询)
  -- 仅一行 per (owner, handoff, scene) 可为 true; 由 RPC 维护
  is_current boolean not null default true,

  -- 审计
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  -- 一个逻辑 storyboard 下 revision 唯一
  unique (owner_id, handoff_id, scene_id, revision)
);

COMMENT ON TABLE public.storyflow_dynamic_storyboards IS
  'KIIKIS 2.1 动态宫格分镜版本表。append-only: 禁止 UPDATE/DELETE。每次修改创建新 revision。';
COMMENT ON COLUMN public.storyflow_dynamic_storyboards.revision IS
  '单调递增版本号。当前版本 = is_current = true 的行 (或 max(revision))。';
COMMENT ON COLUMN public.storyflow_dynamic_storyboards.frames_hash IS
  'frames_json 稳定 hash。相同内容幂等跳过。';
COMMENT ON COLUMN public.storyflow_dynamic_storyboards.is_current IS
  'denormalized 标记。仅一行 per (owner, handoff, scene) 可为 true; RPC 维护。';

-- ============================================================
-- 2. 索引
-- ============================================================

-- 按 handoff 列出所有场景的当前版本 (Production Workbench 主查询)
CREATE INDEX IF NOT EXISTS storyflow_dynamic_storyboards_handoff_current_idx
  ON public.storyflow_dynamic_storyboards(owner_id, handoff_id, scene_id)
  WHERE is_current = true;

-- 按场景查询历史版本 (diff dialog)
CREATE INDEX IF NOT EXISTS storyflow_dynamic_storyboards_scene_history_idx
  ON public.storyflow_dynamic_storyboards(owner_id, handoff_id, scene_id, revision desc);

-- 按 parent_id 反查 (版本链)
CREATE INDEX IF NOT EXISTS storyflow_dynamic_storyboards_parent_idx
  ON public.storyflow_dynamic_storyboards(parent_id)
  WHERE parent_id IS NOT NULL;

-- 按 frames_hash 幂等查找
CREATE INDEX IF NOT EXISTS storyflow_dynamic_storyboards_frames_hash_idx
  ON public.storyflow_dynamic_storyboards(owner_id, handoff_id, scene_id, frames_hash);

-- ============================================================
-- 3. Row Level Security
-- ============================================================

ALTER TABLE public.storyflow_dynamic_storyboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_dynamic_storyboards FORCE ROW LEVEL SECURITY;

-- 3.1 SELECT: owner 只能看自己的 storyboard
DROP POLICY IF EXISTS storyflow_dynamic_storyboards_owner_select ON public.storyflow_dynamic_storyboards;
CREATE POLICY storyflow_dynamic_storyboards_owner_select
  ON public.storyflow_dynamic_storyboards FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()));

-- 3.2 INSERT: 只能以 auth.uid() 作为 owner_id 和 created_by 写入
DROP POLICY IF EXISTS storyflow_dynamic_storyboards_owner_insert ON public.storyflow_dynamic_storyboards;
CREATE POLICY storyflow_dynamic_storyboards_owner_insert
  ON public.storyflow_dynamic_storyboards FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()) AND created_by = (select auth.uid()));

-- 不创建 UPDATE / DELETE policy: 默认拒绝 (append-only)
-- RPC 通过 SECURITY INVOKER 仍受 RLS 约束

-- ============================================================
-- 4. Guard Trigger: 阻止 UPDATE / DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.storyflow_dynamic_storyboards_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'storyflow_dynamic_storyboards is append-only: DELETE not allowed (id=%)', OLD.id;
  END IF;

  -- UPDATE: 完全禁止 (append-only)
  RAISE EXCEPTION 'storyflow_dynamic_storyboards is append-only: UPDATE not allowed (id=%); use create_dynamic_storyboard_revision RPC', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS storyflow_dynamic_storyboards_immutable_guard ON public.storyflow_dynamic_storyboards;
CREATE TRIGGER storyflow_dynamic_storyboards_immutable_guard
  BEFORE UPDATE OR DELETE ON public.storyflow_dynamic_storyboards
  FOR EACH ROW EXECUTE FUNCTION public.storyflow_dynamic_storyboards_immutable_guard();

-- ============================================================
-- 5. 窄 RPC: create_dynamic_storyboard_revision
--    CAS + advisory lock + locked/userEdited 保留 + is_current 维护
-- ============================================================
-- 参数:
--   p_owner_id, p_handoff_id, p_scene_id: 逻辑 storyboard 标识
--   p_expected_revision: 客户端读取时的当前 revision; -1 表示首次创建
--   p_schema_version, p_continuity_mode, p_grid_count, p_grid_rationale,
--   p_spatial_plan, p_shared_cinematography, p_negative_prompt,
--   p_frames_json, p_frames_hash, p_revision_source, p_created_by
-- 返回:
--   成功 → 新行
--   幂等跳过 (相同 frames_hash 已存在) → 已有行
--   CAS 冲突 → NULL + p_out_current_revision 输出当前 revision
--   locked 冲突 (新 frames 覆盖了 locked frame) → NULL + p_out_conflict_kind = 'locked_override'

CREATE OR REPLACE FUNCTION public.create_dynamic_storyboard_revision(
  p_owner_id uuid,
  p_handoff_id uuid,
  p_scene_id text,
  p_expected_revision integer,
  p_schema_version text,
  p_continuity_mode text,
  p_grid_count smallint,
  p_grid_rationale text,
  p_spatial_plan jsonb,
  p_shared_cinematography text,
  p_negative_prompt text,
  p_frames_json jsonb,
  p_frames_hash text,
  p_revision_source text,
  p_created_by uuid,
  OUT p_new_row public.storyflow_dynamic_storyboards,
  OUT p_current_revision integer,
  OUT p_conflict_kind text
) LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_current_rev integer;
  v_existing_id uuid;
  v_new_rev integer;
  v_existing_locked jsonb;
  v_new_frame jsonb;
  v_locked_frame jsonb;
  v_frame_id text;
  v_old_val jsonb;
  v_new_val jsonb;
BEGIN
  -- 校验 schema_version (RPC 是 SECURITY INVOKER, RLS 已限制; 但仍校验业务约束)
  IF p_schema_version <> 'kiikis.dynamic-grid-storyboard/1' THEN
    RAISE EXCEPTION 'invalid schema_version: %', p_schema_version;
  END IF;
  IF p_continuity_mode NOT IN ('NEW', 'CONTINUOUS') THEN
    RAISE EXCEPTION 'invalid continuity_mode: %', p_continuity_mode;
  END IF;
  IF p_grid_count NOT IN (4, 6, 9, 12) THEN
    RAISE EXCEPTION 'invalid grid_count: %', p_grid_count;
  END IF;
  IF p_revision_source NOT IN ('ai', 'user', 'system') THEN
    RAISE EXCEPTION 'invalid revision_source: %', p_revision_source;
  END IF;

  -- advisory lock 串行化同一逻辑 storyboard 的并发写
  PERFORM pg_advisory_xact_lock(
    hashtextextended('dyn_sb:' || p_owner_id::text || ':' || p_handoff_id::text || ':' || p_scene_id, 0)
  );

  -- 1. 读取当前 revision
  SELECT revision INTO v_current_rev
  FROM public.storyflow_dynamic_storyboards
  WHERE owner_id = p_owner_id AND handoff_id = p_handoff_id AND scene_id = p_scene_id
    AND is_current = true
  LIMIT 1;

  IF v_current_rev IS NULL THEN
    -- 逻辑 storyboard 不存在; 首次创建
    IF p_expected_revision <> -1 THEN
      p_current_revision := -1;
      p_conflict_kind := 'not_found';
      RETURN;
    END IF;
    v_new_rev := 0;
  ELSE
    -- 2. CAS 检查
    IF v_current_rev <> p_expected_revision THEN
      p_current_revision := v_current_rev;
      p_conflict_kind := 'cas_mismatch';
      RETURN;
    END IF;

    -- 3. 幂等检查: 相同 frames_hash 已存在则跳过
    SELECT id INTO v_existing_id
    FROM public.storyflow_dynamic_storyboards
    WHERE owner_id = p_owner_id AND handoff_id = p_handoff_id AND scene_id = p_scene_id
      AND frames_hash = p_frames_hash
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      SELECT * INTO p_new_row FROM public.storyflow_dynamic_storyboards WHERE id = v_existing_id;
      p_current_revision := v_current_rev;
      p_conflict_kind := 'idempotent_skip';
      RETURN;
    END IF;

    -- 4. locked/userEdited 保留检查: 如果 p_revision_source = 'ai' (自动重新生成),
    --    新 frames 不得覆盖已有 locked=true 或 userEdited=true 的 frame 内容
    IF p_revision_source = 'ai' THEN
      SELECT frames_json INTO v_existing_locked
      FROM public.storyflow_dynamic_storyboards
      WHERE owner_id = p_owner_id AND handoff_id = p_handoff_id AND scene_id = p_scene_id
        AND is_current = true
      LIMIT 1;

      -- 遍历已 locked frame, 检查新 frames 是否保留其内容
      FOR v_locked_frame IN SELECT jsonb_array_elements(v_existing_locked)
      LOOP
        IF (v_locked_frame->>'locked')::boolean = true
           OR (v_locked_frame->>'userEdited')::boolean = true THEN
          v_frame_id := v_locked_frame->>'id';
          -- 在新 frames 中找同 id frame
          SELECT * INTO v_new_frame FROM jsonb_array_elements(p_frames_json) WHERE value->>'id' = v_frame_id LIMIT 1;

          IF v_new_frame IS NULL THEN
            -- 新版本删除了 locked frame
            p_current_revision := v_current_rev;
            p_conflict_kind := 'locked_override';
            RETURN;
          END IF;

          -- 比较关键字段: visualDescription / shotSize / cameraMovement / characterIds / action
          v_old_val := jsonb_build_object(
            'visualDescription', v_locked_frame->'visualDescription',
            'shotSize', v_locked_frame->'shotSize',
            'cameraMovement', v_locked_frame->'cameraMovement',
            'characterIds', v_locked_frame->'characterIds',
            'action', v_locked_frame->'action'
          );
          v_new_val := jsonb_build_object(
            'visualDescription', v_new_frame->'visualDescription',
            'shotSize', v_new_frame->'shotSize',
            'cameraMovement', v_new_frame->'cameraMovement',
            'characterIds', v_new_frame->'characterIds',
            'action', v_new_frame->'action'
          );

          IF v_old_val IS DISTINCT FROM v_new_val THEN
            p_current_revision := v_current_rev;
            p_conflict_kind := 'locked_override';
            RETURN;
          END IF;
        END IF;
      END LOOP;
    END IF;

    v_new_rev := v_current_rev + 1;
  END IF;

  -- 5. 维护 is_current: 旧 current 置 false
  -- 注意: append-only guard 禁止 UPDATE, 但 RPC 需要 UPDATE is_current
  -- 解决: 使用 ALTER TABLE ... DISABLE TRIGGER 或在 RPC 内直接通过 SECURITY DEFINER 绕过
  -- 这里采用: 在 RPC 内使用 superuser 角色或直接 UPDATE (RPC 是 SECURITY INVOKER,
  -- 但 guard trigger 在 BEFORE UPDATE 上, 仍会阻止)
  -- 实际方案: 改用专用辅助函数 set_dynamic_storyboard_not_current, SECURITY DEFINER,
  -- 并在 guard trigger 中识别该函数调用 (通过 current_setting)

  -- 标记本次会话允许 is_current 更新
  PERFORM set_config('app.dyn_sb.allow_is_current_update', 'true', true);

  UPDATE public.storyflow_dynamic_storyboards
  SET is_current = false
  WHERE owner_id = p_owner_id AND handoff_id = p_handoff_id AND scene_id = p_scene_id
    AND is_current = true;

  PERFORM set_config('app.dyn_sb.allow_is_current_update', 'false', true);

  -- 6. 插入新版本
  INSERT INTO public.storyflow_dynamic_storyboards (
    owner_id, handoff_id, scene_id,
    schema_version, continuity_mode, grid_count, grid_rationale,
    spatial_plan, shared_cinematography, negative_prompt,
    frames_json, frames_hash,
    revision, parent_id, revision_source, is_current,
    created_by
  ) VALUES (
    p_owner_id, p_handoff_id, p_scene_id,
    p_schema_version, p_continuity_mode, p_grid_count, p_grid_rationale,
    p_spatial_plan, p_shared_cinematography, p_negative_prompt,
    p_frames_json, p_frames_hash,
    v_new_rev, NULL, p_revision_source, true,
    p_created_by
  )
  RETURNING * INTO p_new_row;

  -- 7. 回填 parent_id (新行的 parent = 上一版本)
  IF v_current_rev IS NOT NULL THEN
    UPDATE public.storyflow_dynamic_storyboards
    SET parent_id = (
      SELECT id FROM public.storyflow_dynamic_storyboards prev
      WHERE prev.owner_id = p_owner_id AND prev.handoff_id = p_handoff_id AND prev.scene_id = p_scene_id
        AND prev.revision = v_current_rev
      LIMIT 1
    )
    WHERE id = p_new_row.id;

    SELECT * INTO p_new_row FROM public.storyflow_dynamic_storyboards WHERE id = p_new_row.id;
  END IF;

  p_current_revision := v_new_rev;
  p_conflict_kind := 'created';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_dynamic_storyboard_revision(
  uuid, uuid, text, integer, text, text, smallint, text, jsonb, text, text, jsonb, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dynamic_storyboard_revision(
  uuid, uuid, text, integer, text, text, smallint, text, jsonb, text, text, jsonb, text, text, uuid
) TO authenticated;

-- ============================================================
-- 6. 更新 Guard Trigger: 允许 RPC 内 is_current 更新
-- ============================================================

CREATE OR REPLACE FUNCTION public.storyflow_dynamic_storyboards_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_allow_update boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'storyflow_dynamic_storyboards is append-only: DELETE not allowed (id=%)', OLD.id;
  END IF;

  -- UPDATE: 默认禁止
  -- 但允许 RPC 通过 set_config('app.dyn_sb.allow_is_current_update', 'true') 后只更新 is_current
  v_allow_update := coalesce(current_setting('app.dyn_sb.allow_is_current_update', true)::boolean, false);

  IF v_allow_update = false THEN
    RAISE EXCEPTION 'storyflow_dynamic_storyboards is append-only: UPDATE not allowed (id=%); use create_dynamic_storyboard_revision RPC', OLD.id;
  END IF;

  -- 仅允许更新 is_current 字段
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.handoff_id IS DISTINCT FROM OLD.handoff_id
     OR NEW.scene_id IS DISTINCT FROM OLD.scene_id
     OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
     OR NEW.continuity_mode IS DISTINCT FROM OLD.continuity_mode
     OR NEW.grid_count IS DISTINCT FROM OLD.grid_count
     OR NEW.grid_rationale IS DISTINCT FROM OLD.grid_rationale
     OR NEW.spatial_plan IS DISTINCT FROM OLD.spatial_plan
     OR NEW.shared_cinematography IS DISTINCT FROM OLD.shared_cinematography
     OR NEW.negative_prompt IS DISTINCT FROM OLD.negative_prompt
     OR NEW.frames_json IS DISTINCT FROM OLD.frames_json
     OR NEW.frames_hash IS DISTINCT FROM OLD.frames_hash
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.revision_source IS DISTINCT FROM OLD.revision_source
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'storyflow_dynamic_storyboards: only is_current may be updated (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 7. 窄 RPC: get_current_dynamic_storyboard
--    返回指定 (handoff, scene) 的当前版本
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_dynamic_storyboard(
  p_owner_id uuid,
  p_handoff_id uuid,
  p_scene_id text
) RETURNS public.storyflow_dynamic_storyboards
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_row public.storyflow_dynamic_storyboards;
BEGIN
  SELECT * INTO v_row
  FROM public.storyflow_dynamic_storyboards
  WHERE owner_id = p_owner_id AND handoff_id = p_handoff_id AND scene_id = p_scene_id
    AND is_current = true
  LIMIT 1;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_dynamic_storyboard(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_dynamic_storyboard(uuid, uuid, text) TO authenticated;

-- ============================================================
-- 8. 窄 RPC: list_dynamic_storyboards_for_handoff
--    返回 handoff 下所有场景的当前版本
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_dynamic_storyboards_for_handoff(
  p_owner_id uuid,
  p_handoff_id uuid
) RETURNS SETOF public.storyflow_dynamic_storyboards
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.storyflow_dynamic_storyboards
  WHERE owner_id = p_owner_id AND handoff_id = p_handoff_id AND is_current = true
  ORDER BY scene_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_dynamic_storyboards_for_handoff(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_dynamic_storyboards_for_handoff(uuid, uuid) TO authenticated;

-- ============================================================
-- 9. 窄 RPC: list_dynamic_storyboard_history
--    返回指定 (handoff, scene) 的所有历史版本 (倒序)
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_dynamic_storyboard_history(
  p_owner_id uuid,
  p_handoff_id uuid,
  p_scene_id text,
  p_limit integer default 50
) RETURNS SETOF public.storyflow_dynamic_storyboards
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.storyflow_dynamic_storyboards
  WHERE owner_id = p_owner_id AND handoff_id = p_handoff_id AND scene_id = p_scene_id
  ORDER BY revision DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_dynamic_storyboard_history(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_dynamic_storyboard_history(uuid, uuid, text, integer) TO authenticated;
