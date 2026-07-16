-- Kiikis Production Art Workbench
-- Run after docs/supabase-schema.sql, docs/supabase-universe-migration.sql,
-- and docs/supabase-actor-team-migration.sql.

create extension if not exists pgcrypto;

create table if not exists public.storyflow_art_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.storyflow_teams(id) on delete set null,
  universe_id uuid references public.storyflow_universes(id) on delete set null,
  source_project_id text references public.storyflow_projects(id) on delete set null,
  name text not null,
  visual_style text not null default '',
  provider_selection text not null default 'smart' check (provider_selection in ('smart','atlas','flux')),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_art_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyflow_art_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_type text not null default 'upload' check (source_type in ('upload','project','universe','chat')),
  mime_type text,
  storage_path text,
  extracted_text text not null default '',
  parse_status text not null default 'ready' check (parse_status in ('pending','ready','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_art_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyflow_art_projects(id) on delete cascade,
  actor_id uuid references public.storyflow_actor_profiles(id) on delete set null,
  universe_entity_id uuid references public.storyflow_universe_entities(id) on delete set null,
  kind text not null check (kind in ('character','scene','prop')),
  name text not null,
  narrative_role text not null default '',
  description text not null default '',
  identity_anchor text not null default '',
  master_variant_id uuid,
  status text not null default 'draft' check (status in ('draft','generating','candidate','approved','published','archived','error')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_art_asset_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.storyflow_art_assets(id) on delete cascade,
  name text not null,
  variant_type text not null default 'master' check (variant_type in ('master','appearance','state')),
  prompt text not null default '',
  negative_prompt text not null default '',
  approved_version_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_art_asset_versions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.storyflow_art_asset_variants(id) on delete cascade,
  storage_path text not null,
  source text not null check (source in ('generated','uploaded')),
  provider text,
  model text,
  provider_task_id text,
  prompt text not null default '',
  negative_prompt text not null default '',
  seed bigint,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.storyflow_art_assets
  drop constraint if exists storyflow_art_assets_master_variant_id_fkey;
alter table public.storyflow_art_assets
  add constraint storyflow_art_assets_master_variant_id_fkey foreign key (master_variant_id) references public.storyflow_art_asset_variants(id) on delete set null;
alter table public.storyflow_art_asset_variants
  drop constraint if exists storyflow_art_asset_variants_approved_version_id_fkey;
alter table public.storyflow_art_asset_variants
  add constraint storyflow_art_asset_variants_approved_version_id_fkey foreign key (approved_version_id) references public.storyflow_art_asset_versions(id) on delete set null;

create table if not exists public.storyflow_art_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyflow_art_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_art_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyflow_art_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  inverse_payload jsonb,
  status text not null default 'applied' check (status in ('pending_confirmation','applied','undone','failed')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table if not exists public.storyflow_art_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyflow_art_projects(id) on delete cascade,
  asset_id uuid not null references public.storyflow_art_assets(id) on delete cascade,
  variant_id uuid not null references public.storyflow_art_asset_variants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  model text not null,
  provider_task_id text,
  prompt text not null,
  request_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','persist_failed')),
  requested_count integer not null default 1 check (requested_count in (1,2,4)),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.storyflow_art_publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyflow_art_projects(id) on delete cascade,
  asset_id uuid not null references public.storyflow_art_assets(id) on delete cascade,
  version_id uuid not null references public.storyflow_art_asset_versions(id) on delete restrict,
  universe_id uuid not null references public.storyflow_universes(id) on delete cascade,
  published_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'published' check (status in ('published','superseded','withdrawn')),
  package jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_art_audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyflow_art_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists storyflow_art_projects_owner_idx on public.storyflow_art_projects (owner_id, updated_at desc);
create index if not exists storyflow_art_projects_team_idx on public.storyflow_art_projects (team_id, updated_at desc);
create index if not exists storyflow_art_assets_project_idx on public.storyflow_art_assets (project_id, kind, status, updated_at desc);
create index if not exists storyflow_art_variants_asset_idx on public.storyflow_art_asset_variants (asset_id, variant_type, updated_at desc);
create index if not exists storyflow_art_versions_variant_idx on public.storyflow_art_asset_versions (variant_id, created_at desc);
create index if not exists storyflow_art_chat_project_idx on public.storyflow_art_chat_messages (project_id, created_at);
create index if not exists storyflow_art_jobs_project_idx on public.storyflow_art_generation_jobs (project_id, status, created_at desc);
create index if not exists storyflow_art_publications_asset_idx on public.storyflow_art_publications (asset_id, created_at desc);
create index if not exists storyflow_art_audit_project_idx on public.storyflow_art_audit_events (project_id, created_at desc);

alter table public.storyflow_art_projects enable row level security;
alter table public.storyflow_art_sources enable row level security;
alter table public.storyflow_art_assets enable row level security;
alter table public.storyflow_art_asset_variants enable row level security;
alter table public.storyflow_art_asset_versions enable row level security;
alter table public.storyflow_art_chat_messages enable row level security;
alter table public.storyflow_art_actions enable row level security;
alter table public.storyflow_art_generation_jobs enable row level security;
alter table public.storyflow_art_publications enable row level security;
alter table public.storyflow_art_audit_events enable row level security;

drop policy if exists "art_projects_access" on public.storyflow_art_projects;
create policy "art_projects_access" on public.storyflow_art_projects for all to authenticated
  using (owner_id = auth.uid() or exists (select 1 from public.storyflow_team_members m where m.team_id = team_id and m.user_id = auth.uid() and m.status = 'active'))
  with check (owner_id = auth.uid() and (team_id is null or exists (select 1 from public.storyflow_team_members m where m.team_id = team_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','editor'))));

-- Child-table access is inherited from the parent project. Viewers can select;
-- owner/admin/editor can write. Service-role API routes still validate the user.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'storyflow_art_sources','storyflow_art_assets','storyflow_art_chat_messages','storyflow_art_actions',
    'storyflow_art_generation_jobs','storyflow_art_publications','storyflow_art_audit_events'
  ] loop
    execute format('drop policy if exists art_project_child_access on public.%I', table_name);
    execute format($policy$
      create policy art_project_child_access on public.%I for all to authenticated
      using (exists (
        select 1 from public.storyflow_art_projects p
        left join public.storyflow_team_members m on m.team_id = p.team_id and m.user_id = auth.uid() and m.status = 'active'
        where p.id = project_id and (p.owner_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))
      ))
      with check (exists (
        select 1 from public.storyflow_art_projects p
        left join public.storyflow_team_members m on m.team_id = p.team_id and m.user_id = auth.uid() and m.status = 'active'
        where p.id = project_id and (p.owner_id = auth.uid() or m.role in ('owner','admin','editor'))
      ))
    $policy$, table_name);
  end loop;
end $$;

drop policy if exists "art_variants_access" on public.storyflow_art_asset_variants;
create policy "art_variants_access" on public.storyflow_art_asset_variants for all to authenticated
  using (exists (select 1 from public.storyflow_art_assets a join public.storyflow_art_projects p on p.id = a.project_id left join public.storyflow_team_members m on m.team_id = p.team_id and m.user_id = auth.uid() and m.status = 'active' where a.id = asset_id and (p.owner_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_art_assets a join public.storyflow_art_projects p on p.id = a.project_id left join public.storyflow_team_members m on m.team_id = p.team_id and m.user_id = auth.uid() and m.status = 'active' where a.id = asset_id and (p.owner_id = auth.uid() or m.role in ('owner','admin','editor'))));

drop policy if exists "art_versions_access" on public.storyflow_art_asset_versions;
create policy "art_versions_access" on public.storyflow_art_asset_versions for all to authenticated
  using (exists (select 1 from public.storyflow_art_asset_variants v join public.storyflow_art_assets a on a.id = v.asset_id join public.storyflow_art_projects p on p.id = a.project_id left join public.storyflow_team_members m on m.team_id = p.team_id and m.user_id = auth.uid() and m.status = 'active' where v.id = variant_id and (p.owner_id = auth.uid() or m.role in ('owner','admin','editor','viewer'))))
  with check (exists (select 1 from public.storyflow_art_asset_variants v join public.storyflow_art_assets a on a.id = v.asset_id join public.storyflow_art_projects p on p.id = a.project_id left join public.storyflow_team_members m on m.team_id = p.team_id and m.user_id = auth.uid() and m.status = 'active' where v.id = variant_id and (p.owner_id = auth.uid() or m.role in ('owner','admin','editor'))));

insert into storage.buckets (id, name, public)
values ('art-assets', 'art-assets', false)
on conflict (id) do update set public = false;
