-- 20260727000000_admin_rbac_and_user_management.sql
-- 第一期后台管理系统：RBAC + 审计 + AI 指令

-- ========== 1. storyflow_admin_roles ==========
CREATE TABLE IF NOT EXISTS public.storyflow_admin_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin','operator','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- ========== 2. storyflow_admin_audit_log ==========
CREATE TABLE IF NOT EXISTS public.storyflow_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_ref text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON public.storyflow_admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON public.storyflow_admin_audit_log (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.storyflow_admin_audit_log (action);

-- ========== 3. storyflow_ai_prompts ==========
CREATE TABLE IF NOT EXISTS public.storyflow_ai_prompts (
  key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('rules','task')),
  label text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- ========== 4. storyflow_ai_prompt_versions ==========
CREATE TABLE IF NOT EXISTS public.storyflow_ai_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key text NOT NULL REFERENCES public.storyflow_ai_prompts(key) ON DELETE CASCADE,
  body text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_key ON public.storyflow_ai_prompt_versions (prompt_key, created_at DESC);

-- ========== 5. storyflow_ai_prompt_overrides ==========
CREATE TABLE IF NOT EXISTS public.storyflow_ai_prompt_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','task_type')),
  target text NOT NULL DEFAULT '*',
  injection_text text NOT NULL,
  position text NOT NULL CHECK (position IN ('prepend','append')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_overrides_enabled ON public.storyflow_ai_prompt_overrides (enabled);

-- ========== RLS ==========
ALTER TABLE public.storyflow_admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_ai_prompt_overrides ENABLE ROW LEVEL SECURITY;

-- admin_roles: super_admin 全读写；本人可读自己行
DROP POLICY IF EXISTS admin_roles_super_all ON public.storyflow_admin_roles;
DROP POLICY IF EXISTS admin_roles_self_select ON public.storyflow_admin_roles;
CREATE POLICY admin_roles_super_all ON public.storyflow_admin_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  );
CREATE POLICY admin_roles_self_select ON public.storyflow_admin_roles
  FOR SELECT USING (user_id = auth.uid());

-- audit_log: super_admin 全读；operator 可读自己产生的
DROP POLICY IF EXISTS audit_log_super_select ON public.storyflow_admin_audit_log;
DROP POLICY IF EXISTS audit_log_self_select ON public.storyflow_admin_audit_log;
CREATE POLICY audit_log_super_select ON public.storyflow_admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  );
CREATE POLICY audit_log_self_select ON public.storyflow_admin_audit_log
  FOR SELECT USING (admin_user_id = auth.uid());

DROP POLICY IF EXISTS audit_log_super_write ON public.storyflow_admin_audit_log;
CREATE POLICY audit_log_super_write ON public.storyflow_admin_audit_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role = 'super_admin')
  );

-- ai_prompts: 任何 admin（含 viewer）可读；operator+ 可写
DROP POLICY IF EXISTS ai_prompts_admin_read ON public.storyflow_ai_prompts;
DROP POLICY IF EXISTS ai_prompts_operator_write ON public.storyflow_ai_prompts;
CREATE POLICY ai_prompts_admin_read ON public.storyflow_ai_prompts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r WHERE r.user_id = auth.uid())
  );
CREATE POLICY ai_prompts_operator_write ON public.storyflow_ai_prompts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  );

-- ai_prompt_versions: append-only（版本历史不可修改），admin 可读，operator+ 可 INSERT
DROP POLICY IF EXISTS ai_prompt_versions_admin_read ON public.storyflow_ai_prompt_versions;
DROP POLICY IF EXISTS ai_prompt_versions_operator_write ON public.storyflow_ai_prompt_versions;
CREATE POLICY ai_prompt_versions_admin_read ON public.storyflow_ai_prompt_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r WHERE r.user_id = auth.uid())
  );
CREATE POLICY ai_prompt_versions_operator_write ON public.storyflow_ai_prompt_versions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  );

-- ai_prompt_overrides: 同 ai_prompts
DROP POLICY IF EXISTS ai_prompt_overrides_admin_read ON public.storyflow_ai_prompt_overrides;
DROP POLICY IF EXISTS ai_prompt_overrides_operator_write ON public.storyflow_ai_prompt_overrides;
CREATE POLICY ai_prompt_overrides_admin_read ON public.storyflow_ai_prompt_overrides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r WHERE r.user_id = auth.uid())
  );
CREATE POLICY ai_prompt_overrides_operator_write ON public.storyflow_ai_prompt_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.storyflow_admin_roles r
            WHERE r.user_id = auth.uid() AND r.role IN ('super_admin','operator'))
  );

-- ========== 种子：ADMIN_EMAIL → super_admin ==========
-- 首次部署时把 .env 的 ADMIN_EMAIL 对应用户写入 super_admin
DO $$
DECLARE
  admin_email text := lower(trim(coalesce(current_setting('app.admin_email', true), '')));
  admin_user uuid;
BEGIN
  IF admin_email = '' THEN
    RAISE NOTICE 'ADMIN_EMAIL 未设置，跳过种子';
    RETURN;
  END IF;
  SELECT id INTO admin_user FROM auth.users WHERE lower(email) = admin_email LIMIT 1;
  IF admin_user IS NULL THEN
    RAISE NOTICE 'ADMIN_EMAIL % 未找到对应用户，跳过种子', admin_email;
    RETURN;
  END IF;
  INSERT INTO public.storyflow_admin_roles (user_id, role, updated_by)
  VALUES (admin_user, 'super_admin', admin_user)
  ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', updated_at = now(), updated_by = admin_user;
  RAISE NOTICE '已种子 super_admin: %', admin_email;
END $$;
