-- StoryFlow AI 2.0 Phase 2 migration
-- Execute in Supabase SQL Editor after docs/supabase-schema.sql.
-- This is additive: it keeps the Phase 1 project JSON sync working while adding structured production tables.

create extension if not exists pgcrypto;

alter table public.storyflow_projects
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists mode text,
  add column if not exists target_market text,
  add column if not exists genre text,
  add column if not exists language text,
  add column if not exists episode_count integer,
  add column if not exists episode_duration text,
  add column if not exists current_phase text default 'project_setup',
  add column if not exists story_bible jsonb not null default '{}'::jsonb;

update public.storyflow_projects
set
  owner_id = coalesce(owner_id, user_id),
  mode = coalesce(mode, workflow_type, data->>'workflowType'),
  target_market = coalesce(target_market, data->>'market'),
  genre = coalesce(genre, data->>'genre'),
  language = coalesce(language, data->>'targetLanguage'),
  episode_count = coalesce(episode_count, nullif(data->>'episodeCount', '')::integer),
  episode_duration = coalesce(episode_duration, data->>'episodeDuration'),
  story_bible = case
    when story_bible = '{}'::jsonb and data ? 'storyBible' then data->'storyBible'
    else story_bible
  end
where true;

alter table public.storyflow_project_steps
  add column if not exists title text,
  add column if not exists content_json jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1;

update public.storyflow_project_steps
set
  content_json = case
    when content_json = '{}'::jsonb and content is not null then content
    else content_json
  end,
  version = coalesce(version, version_no, 1)
where true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'storyflow_project_steps_status_check'
      and conrelid = 'public.storyflow_project_steps'::regclass
  ) then
    alter table public.storyflow_project_steps
      add constraint storyflow_project_steps_status_check
      check (status in ('empty','draft','confirmed','stale'));
  end if;
end $$;

create table if not exists public.storyflow_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  name text not null default '未命名角色',
  role text,
  age text,
  goal text,
  wound text,
  secret text,
  relationship_notes text,
  voice_style text,
  visual_prompt text,
  content_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyflow_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  episode_no integer not null,
  title text,
  opening_hook text,
  emotional_goal text,
  conflict text,
  reversal text,
  cliffhanger text,
  summary text,
  score_json jsonb not null default '{}'::jsonb,
  content_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, episode_no)
);

create table if not exists public.storyflow_scenes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  episode_id uuid not null references public.storyflow_episodes(id) on delete cascade,
  scene_no integer not null,
  location text,
  time text,
  characters jsonb not null default '[]'::jsonb,
  beats jsonb not null default '[]'::jsonb,
  visual_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, scene_no)
);

alter table public.storyflow_generation_tasks
  add column if not exists target_entity_type text,
  add column if not exists target_entity_id text,
  add column if not exists retry_of uuid references public.storyflow_generation_tasks(id) on delete set null,
  add column if not exists applied_at timestamptz;

alter table public.storyflow_generations
  add column if not exists target_entity_type text,
  add column if not exists target_entity_id text,
  add column if not exists applied_at timestamptz;

alter table public.storyflow_versions
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists version_no integer,
  add column if not exists source text,
  add column if not exists snapshot_text text,
  add column if not exists snapshot_json jsonb,
  add column if not exists diff_json jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.storyflow_versions
set
  entity_type = coalesce(entity_type, 'project_step'),
  source = coalesce(source, version_type, 'manual'),
  snapshot_json = coalesce(snapshot_json, content_snapshot, '{}'::jsonb),
  diff_json = coalesce(diff_json, diff_snapshot, '{}'::jsonb),
  created_by = coalesce(created_by, user_id),
  version_no = coalesce(version_no, 1)
where true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'storyflow_versions_source_check'
      and conrelid = 'public.storyflow_versions'::regclass
  ) then
    alter table public.storyflow_versions
      add constraint storyflow_versions_source_check
      check (source in ('ai','manual','import','restore','demo','optimize'));
  end if;
end $$;

create table if not exists public.storyflow_localization_diffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  episode_id uuid references public.storyflow_episodes(id) on delete cascade,
  scene_id uuid references public.storyflow_scenes(id) on delete cascade,
  source_text text,
  localized_text text,
  target_market text,
  target_language text,
  reason_json jsonb not null default '[]'::jsonb,
  risk_notes text,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.storyflow_drama_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id text not null references public.storyflow_projects(id) on delete cascade,
  episode_id uuid references public.storyflow_episodes(id) on delete cascade,
  total_score numeric(4, 2),
  hook_score numeric(4, 2),
  conflict_density_score numeric(4, 2),
  emotional_progression_score numeric(4, 2),
  reversal_score numeric(4, 2),
  cliffhanger_score numeric(4, 2),
  dialogue_naturalness_score numeric(4, 2),
  localization_score numeric(4, 2),
  production_feasibility_score numeric(4, 2),
  suggestions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.storyflow_exports
  add column if not exists file_url text,
  add column if not exists payload_json jsonb,
  add column if not exists status text not null default 'completed';

update public.storyflow_exports
set payload_json = coalesce(payload_json, metadata, '{}'::jsonb)
where true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'storyflow_exports_export_type_check'
      and conrelid = 'public.storyflow_exports'::regclass
  ) then
    alter table public.storyflow_exports
      add constraint storyflow_exports_export_type_check
      check (export_type in ('markdown','json','docx','pdf'));
  end if;
end $$;

create table if not exists public.storyflow_task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  task_id uuid references public.storyflow_generation_tasks(id) on delete cascade,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists storyflow_project_steps_project_step_idx on public.storyflow_project_steps(project_id, step_key);
create index if not exists storyflow_characters_project_idx on public.storyflow_characters(project_id, updated_at desc);
create index if not exists storyflow_episodes_project_episode_idx on public.storyflow_episodes(project_id, episode_no);
create index if not exists storyflow_scenes_episode_scene_idx on public.storyflow_scenes(episode_id, scene_no);
create index if not exists storyflow_versions_entity_idx on public.storyflow_versions(project_id, entity_type, entity_id, created_at desc);
create index if not exists storyflow_localization_diffs_project_idx on public.storyflow_localization_diffs(project_id, created_at desc);
create index if not exists storyflow_drama_scores_project_idx on public.storyflow_drama_scores(project_id, created_at desc);
create index if not exists storyflow_exports_project_idx on public.storyflow_exports(project_id, created_at desc);
create index if not exists storyflow_task_events_task_idx on public.storyflow_task_events(task_id, created_at desc);

alter table public.storyflow_characters enable row level security;
alter table public.storyflow_episodes enable row level security;
alter table public.storyflow_scenes enable row level security;
alter table public.storyflow_localization_diffs enable row level security;
alter table public.storyflow_drama_scores enable row level security;
alter table public.storyflow_task_events enable row level security;

drop policy if exists "characters_owner_all" on public.storyflow_characters;
drop policy if exists "episodes_owner_all" on public.storyflow_episodes;
drop policy if exists "scenes_owner_all" on public.storyflow_scenes;
drop policy if exists "localization_diffs_owner_all" on public.storyflow_localization_diffs;
drop policy if exists "drama_scores_owner_all" on public.storyflow_drama_scores;
drop policy if exists "task_events_owner_select" on public.storyflow_task_events;

create policy "characters_owner_all" on public.storyflow_characters for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "episodes_owner_all" on public.storyflow_episodes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "scenes_owner_all" on public.storyflow_scenes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "localization_diffs_owner_all" on public.storyflow_localization_diffs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "drama_scores_owner_all" on public.storyflow_drama_scores for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "task_events_owner_select" on public.storyflow_task_events for select to authenticated using (user_id = auth.uid());

-- Rollback note:
-- This migration is additive. To rollback the app code, keep the new columns/tables in place.
-- If a destructive rollback is ever required, drop storyflow_characters/episodes/scenes/localization_diffs/drama_scores/task_events manually after exporting data.
