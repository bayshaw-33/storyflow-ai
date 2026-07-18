-- ============================================================
-- Migration: 20260722000000_actor_usages.sql
-- 目的：建立 storyflow_actor_usages 使用留痕表（PRD §P1 新增使用留痕表）
--
-- 业务语义：
--   其他用户点击"使用此演员"时，不复制或修改原演员，而是建立使用授权记录。
--   同一演员在同一项目中的使用必须幂等（不重复产生记录）。
--   初期所有平台演员免费使用（usage_type = 'internal_free'）。
--   未来商业化时再独立建立 actor_offers、订单和分账。
--
-- 字段说明：
--   actor_id          被使用的演员 ID（FK storyflow_actor_profiles）
--   actor_owner_id    冗余存储演员创建者 ID，便于创建者查询被使用记录
--   consumer_id       使用者 ID（发起"使用此演员"的用户）
--   project_id        使用该演员的项目 ID（必填，使用必须关联项目）
--   source_unit_id    可选：关联的源单元（episode/universe 节点）
--   portrayal_id      可选：创建的本作角色形象 ID（FK storyflow_character_appearance_variants）
--   usage_type        使用类型：internal_free（初期免费）/ future: paid
--   terms_version     条款版本（初期 v1，商业化后升版）
--   creator_snapshot  使用时的演员快照（name/avatar/age/gender 等，防止后续篡改）
--   created_at        使用时间
--   revoked_at        撤销时间（取消共享后旧记录保留，但禁止新项目继续调用）
--
-- 幂等约束：
--   UNIQUE (actor_id, consumer_id, project_id) — 同 actor + 同 consumer + 同 project 只一条记录
--   多次点击"使用此演员"不重复产生记录（应用层用 ON CONFLICT DO NOTHING）
--
-- RLS：
--   consumer 可 SELECT/INSERT 自己的 usage
--   actor_owner 可 SELECT 自己 actor 被 usage 的记录（看到谁在用我的演员）
--   不允许 UPDATE/DELETE（使用记录是留痕，不可改不可删）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_actor_usages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_id uuid NOT NULL,
  actor_owner_id uuid NOT NULL,
  consumer_id uuid NOT NULL,
  project_id uuid NOT NULL,
  source_unit_id text,
  portrayal_id uuid,
  usage_type text DEFAULT 'internal_free'::text NOT NULL,
  terms_version text DEFAULT 'v1'::text NOT NULL,
  creator_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at timestamp with time zone,
  CONSTRAINT storyflow_actor_usages_pkey PRIMARY KEY (id),
  CONSTRAINT storyflow_actor_usages_unique UNIQUE (actor_id, consumer_id, project_id),
  CONSTRAINT storyflow_actor_usages_usage_type_check CHECK (usage_type = ANY (ARRAY['internal_free'::text, 'paid'::text]))
);

-- 外键
ALTER TABLE ONLY public.storyflow_actor_usages
  ADD CONSTRAINT storyflow_actor_usages_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.storyflow_actor_profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.storyflow_actor_usages
  ADD CONSTRAINT storyflow_actor_usages_consumer_id_fkey
  FOREIGN KEY (consumer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.storyflow_actor_usages
  ADD CONSTRAINT storyflow_actor_usages_actor_owner_id_fkey
  FOREIGN KEY (actor_owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 索引
CREATE INDEX IF NOT EXISTS storyflow_actor_usages_consumer_idx
  ON public.storyflow_actor_usages USING btree (consumer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS storyflow_actor_usages_owner_idx
  ON public.storyflow_actor_usages USING btree (actor_owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS storyflow_actor_usages_actor_idx
  ON public.storyflow_actor_usages USING btree (actor_id);

CREATE INDEX IF NOT EXISTS storyflow_actor_usages_project_idx
  ON public.storyflow_actor_usages USING btree (project_id, consumer_id);

-- 启用 RLS
ALTER TABLE public.storyflow_actor_usages ENABLE ROW LEVEL SECURITY;

-- SELECT 策略：consumer 可读自己的使用记录，actor_owner 可读自己演员被使用的记录
CREATE POLICY actor_usages_consumer_or_owner_select
  ON public.storyflow_actor_usages
  FOR SELECT TO authenticated
  USING (
    consumer_id = auth.uid()
    OR actor_owner_id = auth.uid()
  );

-- INSERT 只允许服务端 service_role：它会从权威 actor / project 读取 owner、
-- visibility、快照和 consumer，避免 authenticated Data API 伪造 actor_owner_id、
-- project_id 或 creator_snapshot。RLS 默认拒绝没有策略的 INSERT。

-- 不创建 UPDATE/DELETE 策略：使用记录是留痕，不可改不可删
-- （RLS 默认拒绝无策略的操作）

COMMENT ON TABLE public.storyflow_actor_usages IS
  '平台共享演员使用留痕：consumer 在项目中使用 actor 的授权记录，幂等（同 actor+consumer+project 一条）。';
COMMENT ON POLICY actor_usages_consumer_or_owner_select ON public.storyflow_actor_usages IS
  'consumer 可读自己的使用记录；actor_owner 可读自己演员被使用的记录。';
