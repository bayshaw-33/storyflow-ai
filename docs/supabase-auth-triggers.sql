-- ============================================================================
-- KiiKis — Auth triggers
-- 在 Supabase Dashboard -> SQL Editor 执行（需审核后手动运行，勿自动化）。
-- 目标：用户注册成功后，自动在 public.storyflow_profiles 写入一条 profile。
--   - display_name 默认取邮箱 @ 前缀
--   - plan 默认 'free'
-- 设计：trigger 函数以 security definer 运行，绕过 RLS 安全写入；幂等
--   (on conflict do nothing)，对未来 OAuth 注册同样生效。
-- 依赖：storyflow_profiles 已存在且 user_id 为主键（见 supabase-schema.sql）。
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.storyflow_profiles (user_id, email, display_name, plan)
  values (
    new.id,
    new.email,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'creator'),
    'free'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 一次性回填：为 trigger 上线之前已存在的用户（目前 2 个测试账号）补 profile。
-- 幂等，可重复运行。
-- ----------------------------------------------------------------------------
insert into public.storyflow_profiles (user_id, email, display_name, plan)
select
  u.id,
  u.email,
  coalesce(nullif(split_part(u.email, '@', 1), ''), 'creator'),
  'free'
from auth.users u
on conflict (user_id) do nothing;
