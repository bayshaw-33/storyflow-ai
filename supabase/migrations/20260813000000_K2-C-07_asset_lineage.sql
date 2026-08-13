-- K2-C-07: durable Asset identity, version provenance, and append-only usage lineage.
CREATE TABLE IF NOT EXISTS public.storyflow_v2_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT,
  actor_id UUID REFERENCES public.storyflow_actor_profiles(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('character', 'scene', 'prop', 'style', 'universe_package')),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published', 'suspended', 'archived')),
  rights_state TEXT NOT NULL DEFAULT 'ai_generated' CHECK (rights_state IN ('ai_generated', 'portrait_confirmed', 'portrait_pending')),
  current_version_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storyflow_v2_asset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.storyflow_v2_assets(id) ON DELETE CASCADE,
  parent_version_id UUID REFERENCES public.storyflow_v2_asset_versions(id) ON DELETE RESTRICT,
  source_asset_id UUID REFERENCES public.storyflow_v2_assets(id) ON DELETE SET NULL,
  source_project_id TEXT NOT NULL,
  source_step TEXT NOT NULL,
  model_key TEXT,
  generation_job_id TEXT,
  selected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_description TEXT NOT NULL CHECK (length(btrim(change_description)) > 0),
  storage_bucket TEXT NOT NULL CHECK (length(btrim(storage_bucket)) > 0),
  storage_path TEXT NOT NULL CHECK (length(btrim(storage_path)) > 0 AND storage_path !~* '^https?://'),
  preview_storage_bucket TEXT,
  preview_storage_path TEXT CHECK (preview_storage_path IS NULL OR preview_storage_path !~* '^https?://'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.storyflow_v2_assets DROP CONSTRAINT IF EXISTS storyflow_v2_assets_current_version_id_fkey;
ALTER TABLE public.storyflow_v2_assets ADD CONSTRAINT storyflow_v2_assets_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.storyflow_v2_asset_versions(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.storyflow_v2_asset_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.storyflow_v2_assets(id) ON DELETE RESTRICT,
  version_id UUID REFERENCES public.storyflow_v2_asset_versions(id) ON DELETE RESTRICT,
  project_id TEXT,
  work_id TEXT,
  usage_kind TEXT NOT NULL CHECK (length(btrim(usage_kind)) > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storyflow_v2_assets_owner_filter_idx ON public.storyflow_v2_assets(owner_id, kind, status, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storyflow_v2_asset_versions_asset_idx ON public.storyflow_v2_asset_versions(asset_id, created_at ASC);
CREATE INDEX IF NOT EXISTS storyflow_v2_asset_usages_asset_idx ON public.storyflow_v2_asset_usages(asset_id, created_at DESC);

ALTER TABLE public.storyflow_v2_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_asset_usages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_storyflow_v2_asset_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('ready', 'archived')) OR
    (OLD.status = 'ready' AND NEW.status IN ('published', 'suspended', 'archived')) OR
    (OLD.status = 'published' AND NEW.status IN ('suspended', 'archived')) OR
    (OLD.status = 'suspended' AND NEW.status IN ('published', 'archived'))
  ) THEN
    RAISE EXCEPTION 'invalid asset status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storyflow_v2_asset_status_transition ON public.storyflow_v2_assets;
CREATE TRIGGER storyflow_v2_asset_status_transition
  BEFORE UPDATE OF status ON public.storyflow_v2_assets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storyflow_v2_asset_status_transition();

CREATE POLICY storyflow_v2_assets_owner_all ON public.storyflow_v2_assets
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY storyflow_v2_asset_versions_owner_all ON public.storyflow_v2_asset_versions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.storyflow_v2_assets a WHERE a.id = asset_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_v2_assets a WHERE a.id = asset_id AND a.owner_id = auth.uid()));
CREATE POLICY storyflow_v2_asset_usages_owner_all ON public.storyflow_v2_asset_usages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.storyflow_v2_assets a WHERE a.id = asset_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_v2_assets a WHERE a.id = asset_id AND a.owner_id = auth.uid()));
