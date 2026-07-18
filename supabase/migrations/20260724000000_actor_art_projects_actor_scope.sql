-- ============================================================
-- Migration: 20260724000000_actor_art_projects_actor_scope.sql
-- 目的：为 storyflow_art_projects 建立 actor_id 作用域，替代错误的
--      source_project_id = "actor:<actorId>" 模式（违反外键约束）。
--
-- 背景（KIIKIS-TR-ACTOR-P0-005）：
--   演员图组生成（generate-views）需要为每个 (owner × actor) 创建独立
--   art_project 作为资产容器。旧实现把 "actor:<actorId>" 写入
--   source_project_id，但该字段有 FK → storyflow_projects(id)，
--   必然违反外键约束返回 502。
--
-- 变更：
--   1. storyflow_art_projects 加 actor_id uuid 列，FK → actor_profiles(id) ON DELETE SET NULL
--   2. 加 UNIQUE INDEX (owner_id, actor_id) WHERE actor_id IS NOT NULL
--      数据库级幂等：同一 owner + actor 只能有一个 art_project
--   3. storyflow_art_assets.actor_id 已存在（baseline.sql），加 FK 约束
--   4. 加 INDEX (actor_id, identity_anchor) 支持 GET 历史版本查询
--
-- 应用层契约（generate-views route）：
--   - source_project_id 保持 NULL（不再写 "actor:<actorId>"）
--   - art_project 按 (owner_id, actor_id) 幂等
--   - asset 写入 actor_id
--   - pack 身份存入 identity_anchor = "actor-view:<actorId>:<canonical-pack>"
--   - GET 按 actor_id + identity_anchor 查询历史版本
-- ============================================================

-- 1. storyflow_art_projects 加 actor_id 列 + FK
ALTER TABLE public.storyflow_art_projects
  ADD COLUMN IF NOT EXISTS actor_id uuid;

ALTER TABLE public.storyflow_art_projects
  DROP CONSTRAINT IF EXISTS storyflow_art_projects_actor_id_fkey;

ALTER TABLE public.storyflow_art_projects
  ADD CONSTRAINT storyflow_art_projects_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.storyflow_actor_profiles(id)
  ON DELETE SET NULL;

-- 2. 数据库级幂等：同一 owner + actor 只能有一个 art_project
CREATE UNIQUE INDEX IF NOT EXISTS storyflow_art_projects_actor_scope_unique
  ON public.storyflow_art_projects(owner_id, actor_id)
  WHERE actor_id IS NOT NULL;

-- 3. storyflow_art_assets.actor_id 已存在（baseline.sql），补加 FK 约束
ALTER TABLE public.storyflow_art_assets
  DROP CONSTRAINT IF EXISTS storyflow_art_assets_actor_id_fkey;

ALTER TABLE public.storyflow_art_assets
  ADD CONSTRAINT storyflow_art_assets_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.storyflow_actor_profiles(id)
  ON DELETE SET NULL;

-- 4. 查询索引：GET /api/actors/generate-views 按 actor_id + identity_anchor 查询历史版本
CREATE INDEX IF NOT EXISTS storyflow_art_assets_actor_anchor_idx
  ON public.storyflow_art_assets(actor_id, identity_anchor)
  WHERE actor_id IS NOT NULL;

-- 5. 注释：便于运维查询
COMMENT ON COLUMN public.storyflow_art_projects.actor_id IS
  'Actor-scoped art project: when non-null, this project scopes an actor''s generated view packs (three-view / expressions / body-details). source_project_id MUST be NULL for actor-scoped projects.';
COMMENT ON COLUMN public.storyflow_art_assets.actor_id IS
  'Actor reference: when non-null, this asset belongs to an actor art project (not a storyboard project). Combined with identity_anchor = "actor-view:<actorId>:<canonical-pack>" for pack-level dedupe.';
