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

create table if not exists public.storyflow_api_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.storyflow_teams(id) on delete cascade,
  scope text not null default 'personal' check (scope in ('personal','team')),
  provider text not null,
  api_key text not null,
  model text,
  base_url text,
  label text not null default '',
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists storyflow_team_members_user_idx on public.storyflow_team_members (user_id, status);
create index if not exists storyflow_actor_profiles_owner_idx on public.storyflow_actor_profiles (owner_id, updated_at desc);
create index if not exists storyflow_actor_profiles_team_idx on public.storyflow_actor_profiles (team_id, visibility, status);
create index if not exists storyflow_appearance_variants_project_idx on public.storyflow_character_appearance_variants (project_id, status);
create index if not exists storyflow_appearance_variants_actor_idx on public.storyflow_character_appearance_variants (actor_id);
create index if not exists storyflow_universes_team_idx on public.storyflow_universes (team_id, status, updated_at desc);
create index if not exists storyflow_api_connections_user_idx on public.storyflow_api_connections (user_id, status, updated_at desc);
create index if not exists storyflow_api_connections_team_idx on public.storyflow_api_connections (team_id, status, updated_at desc);

alter table public.storyflow_api_connections drop constraint if exists storyflow_api_connections_provider_check;

alter table public.storyflow_teams enable row level security;
alter table public.storyflow_team_members enable row level security;
alter table public.storyflow_actor_profiles enable row level security;
alter table public.storyflow_character_appearance_variants enable row level security;
alter table public.storyflow_api_connections enable row level security;

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
drop policy if exists "universes_team_select" on public.storyflow_universes;
drop policy if exists "universes_team_insert" on public.storyflow_universes;
drop policy if exists "universes_team_update" on public.storyflow_universes;
drop policy if exists "universe_entities_team_all" on public.storyflow_universe_entities;
drop policy if exists "universe_relationships_team_all" on public.storyflow_universe_relationships;
drop policy if exists "universe_timeline_team_all" on public.storyflow_universe_timeline_events;
drop policy if exists "canon_facts_team_all" on public.storyflow_canon_facts;
drop policy if exists "canon_snapshots_team_all" on public.storyflow_canon_state_snapshots;
drop policy if exists "universe_inbox_team_all" on public.storyflow_universe_inbox_items;
drop policy if exists "universe_links_team_all" on public.storyflow_universe_project_links;
drop policy if exists "canon_reports_team_all" on public.storyflow_canon_check_reports;
drop policy if exists "api_connections_owner_or_team_select" on public.storyflow_api_connections;
drop policy if exists "api_connections_owner_or_team_write" on public.storyflow_api_connections;

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

create policy "universes_team_select" on public.storyflow_universes
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = storyflow_universes.team_id and m.user_id = auth.uid() and m.status = 'active'
    )
  );

create policy "universes_team_insert" on public.storyflow_universes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      team_id is null
      or exists (
        select 1 from public.storyflow_team_members m
        where m.team_id = storyflow_universes.team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','editor')
      )
    )
  );

create policy "universes_team_update" on public.storyflow_universes
  for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = storyflow_universes.team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','editor')
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = storyflow_universes.team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','editor')
    )
  );

create policy "universe_entities_team_all" on public.storyflow_universe_entities
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "universe_relationships_team_all" on public.storyflow_universe_relationships
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "universe_timeline_team_all" on public.storyflow_universe_timeline_events
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "canon_facts_team_all" on public.storyflow_canon_facts
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "canon_snapshots_team_all" on public.storyflow_canon_state_snapshots
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "universe_inbox_team_all" on public.storyflow_universe_inbox_items
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "universe_links_team_all" on public.storyflow_universe_project_links
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "canon_reports_team_all" on public.storyflow_canon_check_reports
  for all to authenticated
  using (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_universes u left join public.storyflow_team_members m on m.team_id = u.team_id and m.user_id = auth.uid() and m.status = 'active' where u.id = universe_id and (u.user_id = auth.uid() or m.role in ('owner','admin','editor'))));

create policy "api_connections_owner_or_team_select" on public.storyflow_api_connections
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = storyflow_api_connections.team_id and m.user_id = auth.uid() and m.status = 'active'
    )
  );

create policy "api_connections_owner_or_team_write" on public.storyflow_api_connections
  for all to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.storyflow_team_members m
      where m.team_id = storyflow_api_connections.team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','editor')
    )
  )
  with check (
    user_id = auth.uid()
    and (
      scope = 'personal'
      or exists (
        select 1 from public.storyflow_team_members m
        where m.team_id = storyflow_api_connections.team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','editor')
      )
    )
  );
