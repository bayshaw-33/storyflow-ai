-- Kiikis Actor Library + Team Sharing Foundation
-- Run after docs/supabase-schema.sql and docs/supabase-universe-migration.sql.

create extension if not exists pgcrypto;

create table if not exists public.storyflow_teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.storyflow_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  status text not null default 'active' check (status in ('active','invited','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists public.storyflow_actor_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.storyflow_teams(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private','team')),
  name text not null,
  bio text not null default '',
  age_range text not null default '',
  gender_expression text not null default '',
  ethnicity_style text not null default '',
  face_description text not null default '',
  hair_description text not null default '',
  body_description text not null default '',
  temperament jsonb not null default '[]'::jsonb,
  playable_roles jsonb not null default '[]'::jsonb,
  base_prompt text not null default '',
  negative_prompt text not null default '',
  avatar_asset_id uuid references public.storyflow_assets(id) on delete set null,
  reference_sheet_asset_id uuid references public.storyflow_assets(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_character_appearance_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  universe_id uuid references public.storyflow_universes(id) on delete set null,
  actor_id uuid not null references public.storyflow_actor_profiles(id) on delete restrict,
  universe_entity_id uuid references public.storyflow_universe_entities(id) on delete set null,
  character_name text not null,
  project_style text not null default '',
  costume_direction text not null default '',
  prompt_pack jsonb not null default '{}'::jsonb,
  front_asset_id uuid references public.storyflow_assets(id) on delete set null,
  three_view_asset_id uuid references public.storyflow_assets(id) on delete set null,
  reference_sheet_asset_id uuid references public.storyflow_assets(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.storyflow_assets
  add column if not exists team_id uuid references public.storyflow_teams(id) on delete set null;

alter table public.storyflow_universes
  add column if not exists team_id uuid references public.storyflow_teams(id) on delete set null;

create index if not exists storyflow_team_members_user_idx on public.storyflow_team_members (user_id, status);
create index if not exists storyflow_actor_profiles_owner_idx on public.storyflow_actor_profiles (owner_id, updated_at desc);
create index if not exists storyflow_actor_profiles_team_idx on public.storyflow_actor_profiles (team_id, visibility, status);
create index if not exists storyflow_appearance_variants_project_idx on public.storyflow_character_appearance_variants (project_id, status);
create index if not exists storyflow_appearance_variants_actor_idx on public.storyflow_character_appearance_variants (actor_id);

alter table public.storyflow_teams enable row level security;
alter table public.storyflow_team_members enable row level security;
alter table public.storyflow_actor_profiles enable row level security;
alter table public.storyflow_character_appearance_variants enable row level security;

drop policy if exists "teams_member_select" on public.storyflow_teams;
drop policy if exists "teams_owner_insert" on public.storyflow_teams;
drop policy if exists "teams_admin_update" on public.storyflow_teams;
drop policy if exists "team_members_member_select" on public.storyflow_team_members;
drop policy if exists "team_members_admin_all" on public.storyflow_team_members;
drop policy if exists "actor_profiles_visible_select" on public.storyflow_actor_profiles;
drop policy if exists "actor_profiles_owner_or_team_editor_insert" on public.storyflow_actor_profiles;
drop policy if exists "actor_profiles_owner_or_team_admin_update" on public.storyflow_actor_profiles;
drop policy if exists "appearance_variants_owner_select" on public.storyflow_character_appearance_variants;
drop policy if exists "appearance_variants_owner_insert" on public.storyflow_character_appearance_variants;
drop policy if exists "appearance_variants_owner_update" on public.storyflow_character_appearance_variants;

create policy "teams_member_select" on public.storyflow_teams
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = id and m.user_id = auth.uid() and m.status = 'active'
    )
  );

create policy "teams_owner_insert" on public.storyflow_teams
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "teams_admin_update" on public.storyflow_teams
  for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin')
    )
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin')
    )
  );

create policy "team_members_member_select" on public.storyflow_team_members
  for select to authenticated
  using (user_id = auth.uid());

create policy "team_members_admin_all" on public.storyflow_team_members
  for all to authenticated
  using (
    exists (
      select 1 from public.storyflow_teams t
      where t.id = team_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.storyflow_teams t
      where t.id = team_id and t.owner_id = auth.uid()
    )
  );

create policy "actor_profiles_visible_select" on public.storyflow_actor_profiles
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (
      visibility = 'team'
      and exists (
        select 1 from public.storyflow_team_members m
        where m.team_id = team_id and m.user_id = auth.uid() and m.status = 'active'
      )
    )
  );

create policy "actor_profiles_owner_or_team_editor_insert" on public.storyflow_actor_profiles
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      visibility = 'private'
      or exists (
        select 1 from public.storyflow_team_members m
        where m.team_id = team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','editor')
      )
    )
  );

create policy "actor_profiles_owner_or_team_admin_update" on public.storyflow_actor_profiles
  for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin')
    )
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin')
    )
  );

create policy "appearance_variants_owner_select" on public.storyflow_character_appearance_variants
  for select to authenticated
  using (user_id = auth.uid());

create policy "appearance_variants_owner_insert" on public.storyflow_character_appearance_variants
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "appearance_variants_owner_update" on public.storyflow_character_appearance_variants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
