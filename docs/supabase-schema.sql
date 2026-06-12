-- StoryFlow AI 2.0 Supabase schema
-- 在 Supabase Dashboard -> SQL Editor 执行。
-- 目标：Auth 登录、用户私有项目、AI 任务记录、额度、后续 Story Bible / Diff / DramaScore 预留。

create extension if not exists pgcrypto;

create table if not exists public.storyflow_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'StoryFlow Workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_organization_members (
  organization_id uuid not null references public.storyflow_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.storyflow_projects (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references public.storyflow_organizations(id) on delete set null,
  title text not null default '未命名短剧项目',
  workflow_type text not null default 'creation',
  project_group text not null default '默认分组',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz
);

alter table public.storyflow_projects
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.storyflow_projects
  add column if not exists organization_id uuid references public.storyflow_organizations(id) on delete set null;

alter table public.storyflow_projects
  add column if not exists deleted_at timestamptz;

alter table public.storyflow_projects
  alter column user_id set default auth.uid();

create table if not exists public.storyflow_project_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.storyflow_project_groups
  add column if not exists id uuid default gen_random_uuid();

alter table public.storyflow_project_groups
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'storyflow_project_groups_pkey'
      and conrelid = 'public.storyflow_project_groups'::regclass
  ) then
    alter table public.storyflow_project_groups drop constraint storyflow_project_groups_pkey;
  end if;
end $$;

alter table public.storyflow_project_groups
  alter column id set not null;

alter table public.storyflow_project_groups
  add constraint storyflow_project_groups_pkey primary key (id);

create unique index if not exists storyflow_project_groups_user_name_idx
  on public.storyflow_project_groups (user_id, name);

create table if not exists public.storyflow_project_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  step_key text not null,
  phase_key text not null,
  content jsonb not null default '{}'::jsonb,
  content_text text,
  status text not null default 'draft',
  version_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, step_key)
);

create table if not exists public.storyflow_generation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text,
  project_ref text,
  step_key text not null,
  phase_key text not null,
  status text not null check (status in ('queued','running','streaming','completed','failed','retrying','cancelled')),
  provider text,
  model text,
  input_snapshot jsonb,
  output_snapshot text,
  error_message text,
  token_usage jsonb,
  cost_estimate numeric(10, 4),
  latency_ms integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_generations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.storyflow_generation_tasks(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text,
  step_key text not null,
  phase_key text not null,
  provider text,
  model text,
  input_snapshot jsonb,
  output_snapshot text,
  token_usage jsonb,
  cost_estimate numeric(10, 4),
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_limit integer not null default 100,
  balance integer not null default 100,
  period_start timestamptz not null,
  period_end timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text,
  asset_type text not null,
  storage_path text,
  public_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text,
  export_type text not null,
  format text not null,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text,
  step_key text,
  version_type text not null default 'manual',
  content_snapshot jsonb,
  diff_snapshot jsonb,
  drama_score jsonb,
  created_at timestamptz not null default now()
);

alter table public.storyflow_profiles enable row level security;
alter table public.storyflow_organizations enable row level security;
alter table public.storyflow_organization_members enable row level security;
alter table public.storyflow_projects enable row level security;
alter table public.storyflow_project_groups enable row level security;
alter table public.storyflow_project_steps enable row level security;
alter table public.storyflow_generation_tasks enable row level security;
alter table public.storyflow_generations enable row level security;
alter table public.storyflow_credits enable row level security;
alter table public.storyflow_assets enable row level security;
alter table public.storyflow_exports enable row level security;
alter table public.storyflow_versions enable row level security;

drop policy if exists "storyflow_projects_anon_select" on public.storyflow_projects;
drop policy if exists "storyflow_projects_anon_insert" on public.storyflow_projects;
drop policy if exists "storyflow_projects_anon_update" on public.storyflow_projects;
drop policy if exists "storyflow_projects_anon_delete" on public.storyflow_projects;
drop policy if exists "storyflow_project_groups_anon_select" on public.storyflow_project_groups;
drop policy if exists "storyflow_project_groups_anon_insert" on public.storyflow_project_groups;
drop policy if exists "storyflow_project_groups_anon_update" on public.storyflow_project_groups;

drop policy if exists "profiles_owner_select" on public.storyflow_profiles;
drop policy if exists "profiles_owner_insert" on public.storyflow_profiles;
drop policy if exists "profiles_owner_update" on public.storyflow_profiles;
drop policy if exists "organizations_owner_all" on public.storyflow_organizations;
drop policy if exists "organization_members_self_select" on public.storyflow_organization_members;
drop policy if exists "organization_members_owner_all" on public.storyflow_organization_members;
drop policy if exists "projects_owner_select" on public.storyflow_projects;
drop policy if exists "projects_owner_insert" on public.storyflow_projects;
drop policy if exists "projects_owner_update" on public.storyflow_projects;
drop policy if exists "projects_owner_delete" on public.storyflow_projects;
drop policy if exists "groups_owner_select" on public.storyflow_project_groups;
drop policy if exists "groups_owner_insert" on public.storyflow_project_groups;
drop policy if exists "groups_owner_update" on public.storyflow_project_groups;
drop policy if exists "groups_owner_delete" on public.storyflow_project_groups;
drop policy if exists "steps_owner_all" on public.storyflow_project_steps;
drop policy if exists "generation_tasks_owner_select" on public.storyflow_generation_tasks;
drop policy if exists "generations_owner_select" on public.storyflow_generations;
drop policy if exists "credits_owner_select" on public.storyflow_credits;
drop policy if exists "assets_owner_all" on public.storyflow_assets;
drop policy if exists "exports_owner_all" on public.storyflow_exports;
drop policy if exists "versions_owner_all" on public.storyflow_versions;

create policy "profiles_owner_select" on public.storyflow_profiles for select to authenticated using (user_id = auth.uid());
create policy "profiles_owner_insert" on public.storyflow_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "profiles_owner_update" on public.storyflow_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "organizations_owner_all" on public.storyflow_organizations for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "organization_members_self_select" on public.storyflow_organization_members for select to authenticated using (user_id = auth.uid());
create policy "organization_members_owner_all" on public.storyflow_organization_members for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "projects_owner_select" on public.storyflow_projects for select to authenticated using (user_id = auth.uid() and deleted_at is null);
create policy "projects_owner_insert" on public.storyflow_projects for insert to authenticated with check (user_id = auth.uid());
create policy "projects_owner_update" on public.storyflow_projects for update to authenticated using (user_id = auth.uid() or user_id is null) with check (user_id = auth.uid());
create policy "projects_owner_delete" on public.storyflow_projects for delete to authenticated using (user_id = auth.uid());

create policy "groups_owner_select" on public.storyflow_project_groups for select to authenticated using (user_id = auth.uid());
create policy "groups_owner_insert" on public.storyflow_project_groups for insert to authenticated with check (user_id = auth.uid());
create policy "groups_owner_update" on public.storyflow_project_groups for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "groups_owner_delete" on public.storyflow_project_groups for delete to authenticated using (user_id = auth.uid());

create policy "steps_owner_all" on public.storyflow_project_steps for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "generation_tasks_owner_select" on public.storyflow_generation_tasks for select to authenticated using (user_id = auth.uid());
create policy "generations_owner_select" on public.storyflow_generations for select to authenticated using (user_id = auth.uid());
create policy "credits_owner_select" on public.storyflow_credits for select to authenticated using (user_id = auth.uid());
create policy "assets_owner_all" on public.storyflow_assets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exports_owner_all" on public.storyflow_exports for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "versions_owner_all" on public.storyflow_versions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Service role 会绕过 RLS，用于服务端写 generation_tasks / generations / credits。
-- 不要把 SUPABASE_SERVICE_ROLE_KEY 放到 NEXT_PUBLIC_*，也不要写入前端代码。
