-- StoryFlow AI Phase 4A: Universe Engine Foundation v0.1
-- Run in Supabase Dashboard -> SQL Editor after docs/supabase-schema.sql.

create extension if not exists pgcrypto;

alter table public.storyflow_profiles
  add column if not exists universe_engine_override boolean not null default false;

alter table public.storyflow_projects
  add column if not exists universe_id uuid,
  add column if not exists season_number integer,
  add column if not exists project_role text,
  add column if not exists inheritance_settings jsonb;

create table if not exists public.storyflow_universes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  description text not null default '',
  genre text not null default '',
  default_language text not null default 'English',
  target_markets jsonb not null default '[]'::jsonb,
  tone text not null default '',
  status text not null default 'active' check (status in ('active','archived')),
  access_level text not null default 'studio_annual' check (access_level in ('studio_annual','enterprise')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_universe_entities (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('character','location','organization','object','rule','concept')),
  name text not null,
  summary text not null default '',
  details_json jsonb not null default '{}'::jsonb,
  status text not null default 'canon' check (status in ('canon','draft','alternative','deprecated')),
  tags jsonb not null default '[]'::jsonb,
  source_project_id text,
  source_step_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_universe_relationships (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  source_entity_id uuid references public.storyflow_universe_entities(id) on delete set null,
  target_entity_id uuid references public.storyflow_universe_entities(id) on delete set null,
  relationship_type text not null default 'related',
  relationship_status text not null default 'active',
  summary text not null default '',
  history_json jsonb not null default '{}'::jsonb,
  status text not null default 'canon' check (status in ('canon','draft','alternative','deprecated')),
  source_project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_universe_timeline_events (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  description text not null default '',
  date_label text not null default '',
  season_number integer,
  episode_number integer,
  order_index integer,
  related_entity_ids jsonb not null default '[]'::jsonb,
  is_canon boolean not null default true,
  status text not null default 'canon' check (status in ('canon','draft','alternative','deprecated')),
  source_project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_canon_facts (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fact_text text not null,
  category text not null default 'character' check (category in ('character','relationship','timeline','world_rule','location','secret','production_rule')),
  importance text not null default 'medium' check (importance in ('low','medium','high','critical')),
  status text not null default 'canon' check (status in ('canon','draft','alternative','deprecated')),
  is_locked boolean not null default true,
  source_project_id text,
  source_episode text,
  source_location_text text,
  confirmed_by_user boolean not null default true,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_canon_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text,
  season_number integer,
  title text not null default '',
  summary text not null default '',
  state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_universe_inbox_items (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text,
  item_type text not null check (item_type in ('character','location','relationship','event','canon_fact','state_change','rule')),
  title text not null,
  proposed_payload jsonb not null default '{}'::jsonb,
  source_excerpt text not null default '',
  confidence numeric(4,3) not null default 0.7,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','edited')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_universe_project_links (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_role text not null default 'main_season' check (project_role in ('main_season','spin_off','prequel','adaptation','localization','other')),
  season_number integer,
  inheritance_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (universe_id, project_id)
);

create table if not exists public.storyflow_canon_check_reports (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  project_id text references public.storyflow_projects(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  target_scope text not null default 'project',
  score integer not null default 100,
  issues_json jsonb not null default '[]'::jsonb,
  suggestions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists storyflow_universes_user_updated_idx on public.storyflow_universes (user_id, updated_at desc);
create index if not exists storyflow_universe_entities_universe_idx on public.storyflow_universe_entities (universe_id, type, status);
create index if not exists storyflow_canon_facts_universe_idx on public.storyflow_canon_facts (universe_id, status, importance);
create index if not exists storyflow_universe_inbox_universe_idx on public.storyflow_universe_inbox_items (universe_id, status, created_at desc);
create index if not exists storyflow_universe_links_project_idx on public.storyflow_universe_project_links (project_id);

alter table public.storyflow_universes enable row level security;
alter table public.storyflow_universe_entities enable row level security;
alter table public.storyflow_universe_relationships enable row level security;
alter table public.storyflow_universe_timeline_events enable row level security;
alter table public.storyflow_canon_facts enable row level security;
alter table public.storyflow_canon_state_snapshots enable row level security;
alter table public.storyflow_universe_inbox_items enable row level security;
alter table public.storyflow_universe_project_links enable row level security;
alter table public.storyflow_canon_check_reports enable row level security;

drop policy if exists "universes_owner_all" on public.storyflow_universes;
drop policy if exists "universe_entities_owner_all" on public.storyflow_universe_entities;
drop policy if exists "universe_relationships_owner_all" on public.storyflow_universe_relationships;
drop policy if exists "universe_timeline_owner_all" on public.storyflow_universe_timeline_events;
drop policy if exists "canon_facts_owner_all" on public.storyflow_canon_facts;
drop policy if exists "canon_state_owner_all" on public.storyflow_canon_state_snapshots;
drop policy if exists "universe_inbox_owner_all" on public.storyflow_universe_inbox_items;
drop policy if exists "universe_links_owner_all" on public.storyflow_universe_project_links;
drop policy if exists "canon_reports_owner_all" on public.storyflow_canon_check_reports;

create policy "universes_owner_all" on public.storyflow_universes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "universe_entities_owner_all" on public.storyflow_universe_entities for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "universe_relationships_owner_all" on public.storyflow_universe_relationships for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "universe_timeline_owner_all" on public.storyflow_universe_timeline_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "canon_facts_owner_all" on public.storyflow_canon_facts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "canon_state_owner_all" on public.storyflow_canon_state_snapshots for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "universe_inbox_owner_all" on public.storyflow_universe_inbox_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "universe_links_owner_all" on public.storyflow_universe_project_links for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "canon_reports_owner_all" on public.storyflow_canon_check_reports for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

