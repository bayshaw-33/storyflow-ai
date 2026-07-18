-- 安全与 schema 止血：
-- 1) storyflow_actor_profiles 补 metadata 列
--    lib/supabase/actors.ts 读写 ActorProfile.metadata，但表上此前没有该列，
--    PostgREST 会抛 PGRST204（unknown column）。IF NOT EXISTS 保证可重入。
ALTER TABLE public.storyflow_actor_profiles
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) 收紧 get_user_id_by_email 的 EXECUTE 授权
--    该 SECURITY DEFINER 函数可按邮箱反查 auth.users.id（20260716220000 曾 GRANT anon），
--    线上实际授权（information_schema.routine_privileges）为：PUBLIC / anon / authenticated / postgres / service_role。
--    团队邀请走 service role（serviceFetch），无需暴露给匿名与 PUBLIC，故撤销：
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, PUBLIC;
