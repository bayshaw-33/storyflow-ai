-- StoryFlow AI Supabase schema
-- 在 Supabase Dashboard -> SQL Editor 中执行一次。
-- MVP 自用演示版：anon 可读写。正式商业版需要接入 Auth 后按 user_id 收紧 RLS。

create table if not exists public.storyflow_projects (
  id text primary key,
  title text not null default '未命名短剧项目',
  workflow_type text not null default 'creation',
  project_group text not null default '默认分组',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.storyflow_project_groups (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table public.storyflow_projects enable row level security;
alter table public.storyflow_project_groups enable row level security;

drop policy if exists "storyflow_projects_anon_select" on public.storyflow_projects;
drop policy if exists "storyflow_projects_anon_insert" on public.storyflow_projects;
drop policy if exists "storyflow_projects_anon_update" on public.storyflow_projects;
drop policy if exists "storyflow_projects_anon_delete" on public.storyflow_projects;

create policy "storyflow_projects_anon_select"
on public.storyflow_projects for select
to anon
using (true);

create policy "storyflow_projects_anon_insert"
on public.storyflow_projects for insert
to anon
with check (true);

create policy "storyflow_projects_anon_update"
on public.storyflow_projects for update
to anon
using (true)
with check (true);

create policy "storyflow_projects_anon_delete"
on public.storyflow_projects for delete
to anon
using (true);

drop policy if exists "storyflow_project_groups_anon_select" on public.storyflow_project_groups;
drop policy if exists "storyflow_project_groups_anon_insert" on public.storyflow_project_groups;
drop policy if exists "storyflow_project_groups_anon_update" on public.storyflow_project_groups;

create policy "storyflow_project_groups_anon_select"
on public.storyflow_project_groups for select
to anon
using (true);

create policy "storyflow_project_groups_anon_insert"
on public.storyflow_project_groups for insert
to anon
with check (true);

create policy "storyflow_project_groups_anon_update"
on public.storyflow_project_groups for update
to anon
using (true)
with check (true);

insert into public.storyflow_project_groups (name)
values ('默认分组')
on conflict (name) do nothing;
