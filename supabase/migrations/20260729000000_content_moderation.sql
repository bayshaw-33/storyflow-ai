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
