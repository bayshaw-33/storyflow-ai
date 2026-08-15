-- KIIKIS V2.2 Phase 5 — Work Usage Links (跨工作流关系) + 媒体 Asset 扩展
-- Forward-only. Append-only usage links: UPDATE/DELETE blocked by trigger.
-- Migration timestamp: 20260828050000 (continues P4 20260828040000)

-- ---------------------------------------------------------------------------
-- storyflow_work_usage_links
-- One relationship type across script/art/storyboard/video/song/voice/editing.
-- source_work_version_id is locked at creation time; "updating the source"
-- always appends a new link (or a new target version) — never overwrites.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storyflow_work_usage_links (
  id uuid primary key default gen_random_uuid(),
  -- source side (what is being used)
  source_work_id uuid not null,
  source_work_version_id uuid not null,
  -- target side (who uses it)
  target_project_id text,
  target_work_id uuid not null,
  target_work_version_id uuid,
  target_entity_type text,
  target_entity_id text,
  -- role
  usage_role text not null check (usage_role in (
    'source_script', 'art_reference', 'storyboard_source', 'video_source',
    'universe_theme', 'character_theme', 'work_theme', 'episode_theme',
    'scene_cue', 'diegetic_song', 'character_voice', 'narration',
    'dialogue_line', 'editing_input'
  )),
  -- artifacts
  asset_version_id uuid,
  -- usage grant (non-owner source): snapshot of the grant terms id
  rights_snapshot_id uuid,
  -- metadata
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION public.block_work_usage_link_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'work_usage_links is append-only (no DELETE)';
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'work_usage_links is append-only (no UPDATE)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_usage_links_append_only ON public.storyflow_work_usage_links;
CREATE TRIGGER trg_work_usage_links_append_only
  BEFORE UPDATE OR DELETE ON public.storyflow_work_usage_links
  FOR EACH ROW EXECUTE FUNCTION public.block_work_usage_link_mutation();

-- Indexes for incoming/outgoing lookups and cycle walks
CREATE INDEX IF NOT EXISTS idx_work_usage_links_source
  ON public.storyflow_work_usage_links(source_work_id, source_work_version_id);
CREATE INDEX IF NOT EXISTS idx_work_usage_links_target
  ON public.storyflow_work_usage_links(target_work_id);
CREATE INDEX IF NOT EXISTS idx_work_usage_links_role
  ON public.storyflow_work_usage_links(usage_role);

ALTER TABLE public.storyflow_work_usage_links ENABLE ROW LEVEL SECURITY;

-- Owner sees links of works they own; grantees with an active use grant
-- on the target work see links touching it.
DROP POLICY IF EXISTS "work_usage_links_owner_select" ON public.storyflow_work_usage_links;
CREATE POLICY "work_usage_links_owner_select"
  ON public.storyflow_work_usage_links
  FOR SELECT
  USING (
    exists (
      select 1 from public.storyflow_works w
      where w.id = source_work_id and w.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.storyflow_works w
      where w.id = target_work_id and w.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.storyflow_resource_grants g
      where g.grantee_id = auth.uid()
        and g.resource_type = 'work'
        and g.resource_id in (source_work_id, target_work_id)
        and g.status = 'active'
    )
  );

-- Inserts go through the service layer (service role); owner-insert policy.
DROP POLICY IF EXISTS "work_usage_links_owner_insert" ON public.storyflow_work_usage_links;
CREATE POLICY "work_usage_links_owner_insert"
  ON public.storyflow_work_usage_links
  FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.storyflow_works w
      where w.id = target_work_id and w.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.storyflow_works w
      where w.id = source_work_id and w.owner_id = auth.uid()
    )
  );

COMMENT ON TABLE public.storyflow_work_usage_links IS
  'P5: 跨工作流单一关系类型；append-only；source version 创建时锁定；grant 撤销不删历史 link';

-- ---------------------------------------------------------------------------
-- storyflow_asset_versions_usage (media persistence pointer)
-- Formal media artifacts: provider temp URLs are never marked ready here;
-- Asset Version always points at a persistent storage path when finalized.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storyflow_asset_versions_usage (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  work_id uuid not null,
  version_no integer not null default 1,
  storage_path text not null,
  provider text,
  provider_task_id text,
  model text,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'ingesting' check (status in ('ingesting', 'ready', 'failed')),
  finalized_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (asset_id, version_no)
);

ALTER TABLE public.storyflow_asset_versions_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_versions_usage_owner" ON public.storyflow_asset_versions_usage;
CREATE POLICY "asset_versions_usage_owner"
  ON public.storyflow_asset_versions_usage
  FOR ALL
  USING (
    exists (
      select 1 from public.storyflow_works w
      where w.id = work_id and w.owner_id = auth.uid()
    )
  );

COMMENT ON TABLE public.storyflow_asset_versions_usage IS
  'P5: 正式媒体产物持久指针；provider 临时 URL 只用于 ingestion，ready 后指向持久 storage path';
