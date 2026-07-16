-- ============================================================================
-- KiiKis — Admin read RLS (defense in depth)
-- 在 Supabase Dashboard -> SQL Editor 执行（需审核后手动运行，勿自动化）。
--
-- 安全模型说明（重要，先读再跑）：
--   * 普通用户的 owner-only 策略已存在（profiles_owner_select / credits_owner_select，
--     见 supabase-schema.sql），它保证「任何登录用户只能读到自己的行」。本文件不改动
--     这些策略，普通用户依旧读不到别人的数据。
--   * 后台真正的全量读取走服务端路由 app/admin/users/route.ts：它先校验调用者 token，
--     再要求邮箱 == ADMIN_EMAIL，最后用 service_role 读全表。service_role 绕过 RLS，
--     所以严格来说后台功能不依赖下面这两条策略。
--   * 下面两条 admin select 策略是「第二层防线」：即便将来有人用管理员自己的 anon token
--     直查 profiles/credits，也只有邮箱匹配的管理员能读全表，其他人仍被 owner-only 挡住。
--
-- 邮箱必须与 env ADMIN_EMAIL、路由校验保持完全一致：bayshaw33@gmail.com
-- ============================================================================

drop policy if exists "profiles_admin_select" on public.storyflow_profiles;
create policy "profiles_admin_select" on public.storyflow_profiles
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'bayshaw33@gmail.com');

drop policy if exists "credits_admin_select" on public.storyflow_credits;
create policy "credits_admin_select" on public.storyflow_credits
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'bayshaw33@gmail.com');

-- 验证（可选）：以管理员身份登录后，下面应返回全部行；以普通用户身份则只返回自己。
--   select user_id, email, plan from public.storyflow_profiles;
--   select user_id, balance, monthly_limit from public.storyflow_credits;
