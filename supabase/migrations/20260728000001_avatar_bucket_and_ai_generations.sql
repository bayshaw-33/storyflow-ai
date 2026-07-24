-- ============================================================
-- 社区系统 阶段 A 补充：用户头像 bucket + AI 头像生成日志表
-- 日期: 2026-07-28
-- 说明:
--   1. 创建公开 avatars bucket 供用户头像存储
--   2. 创建 storyflow_ai_avatar_generations 表记录每日 AI 头像生成（限额 3 次/天）
-- ============================================================

-- ============================================================
-- 1. avatars 公开 bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('avatars', 'avatars', true, 5242880) -- 5MB
ON CONFLICT (id) DO NOTHING;

-- bucket Storage 策略：登录用户可上传到自己前缀；所有人可读（公开 bucket）
DROP POLICY IF EXISTS "avatars_read_all" ON storage.objects;
CREATE POLICY "avatars_read_all"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 2. AI 头像生成日志表（每日限额 3 次，UTC 日）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_ai_avatar_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT,
  asset_id UUID REFERENCES public.storyflow_assets(id) ON DELETE SET NULL,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_avatar_generations_user_created
  ON public.storyflow_ai_avatar_generations (user_id, created_at DESC);

ALTER TABLE public.storyflow_ai_avatar_generations ENABLE ROW LEVEL SECURITY;

-- 本人可读自己的生成记录
DROP POLICY IF EXISTS ai_avatar_generations_self_read ON public.storyflow_ai_avatar_generations;
CREATE POLICY ai_avatar_generations_self_read
  ON public.storyflow_ai_avatar_generations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 注：INSERT/DELETE 走 service_role（绕过 RLS），由 API 路由用于限流统计

-- ============================================================
-- Migration 完成
-- ============================================================
