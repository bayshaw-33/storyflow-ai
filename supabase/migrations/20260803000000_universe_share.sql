-- ============================================================
-- 社区系统 阶段 B：宇宙分享
-- 日期: 2026-08-03
-- 说明: universes 表加分享字段 + RLS
-- ============================================================

-- ============================================================
-- 1. storyflow_universes 加分享字段
-- ============================================================
ALTER TABLE public.storyflow_universes
  ADD COLUMN IF NOT EXISTS share_status TEXT DEFAULT 'private'
    CHECK (share_status IN ('private','shared','removed')),
  ADD COLUMN IF NOT EXISTS share_password TEXT,
  ADD COLUMN IF NOT EXISTS share_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_permissions JSONB DEFAULT '{}';

-- 索引：分享状态查询
CREATE INDEX IF NOT EXISTS idx_universes_share_status
  ON public.storyflow_universes(share_status)
  WHERE share_status = 'shared';

-- ============================================================
-- 2. RLS 策略
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = 'storyflow_universes' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE public.storyflow_universes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 本人可读可写自己的宇宙
DROP POLICY IF EXISTS universes_owner_all ON public.storyflow_universes;
CREATE POLICY universes_owner_all
  ON public.storyflow_universes
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 访客只能读 share_status='shared' 的宇宙
DROP POLICY IF EXISTS universes_share_read ON public.storyflow_universes;
CREATE POLICY universes_share_read
  ON public.storyflow_universes
  FOR SELECT
  TO anon, authenticated
  USING (
    user_id = auth.uid()
    OR share_status = 'shared'
  );

-- ============================================================
-- Migration 完成
-- ============================================================
