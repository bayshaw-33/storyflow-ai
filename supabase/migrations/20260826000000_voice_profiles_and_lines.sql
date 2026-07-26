-- ============================================================
-- Voice Profile + Voice Line（TRAE-V2-03）
-- 日期: 2026-08-26
-- 说明: 新建 voice_profiles + voice_lines 两张表 + Storage bucket + RLS
-- 复用 storyflow_generation_jobs（job_type='audio', target_type='voice_line'）
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Storage bucket: voice-lines (private, 通过签名 URL 访问)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-lines', 'voice-lines', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'voice_lines_owner_select'
  ) THEN
    CREATE POLICY voice_lines_owner_select ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'voice-lines' AND owner = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'voice_lines_owner_insert'
  ) THEN
    CREATE POLICY voice_lines_owner_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'voice-lines' AND owner = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'voice_lines_owner_update'
  ) THEN
    CREATE POLICY voice_lines_owner_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'voice-lines' AND owner = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'voice_lines_owner_delete'
  ) THEN
    CREATE POLICY voice_lines_owner_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'voice-lines' AND owner = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 1. storyflow_character_voice_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_character_voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES public.storyflow_actor_profiles(id) ON DELETE CASCADE,
  universe_entity_id UUID REFERENCES public.storyflow_universe_entities(id) ON DELETE CASCADE,
  voice_label TEXT NOT NULL DEFAULT '',
  voice_provider TEXT NOT NULL DEFAULT 'placeholder',
  voice_provider_voice_id TEXT,
  language TEXT NOT NULL DEFAULT 'zh',
  speed NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (speed BETWEEN 0.5 AND 2.0),
  pitch NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (pitch BETWEEN -12 AND 12),
  stability NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (stability BETWEEN 0 AND 1),
  style_prompt TEXT NOT NULL DEFAULT '',
  sample_asset_id UUID REFERENCES public.storyflow_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.storyflow_character_voice_profiles
  DROP CONSTRAINT IF EXISTS voice_profiles_target_check;
ALTER TABLE public.storyflow_character_voice_profiles
  ADD CONSTRAINT voice_profiles_target_check
  CHECK (actor_profile_id IS NOT NULL OR universe_entity_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_profiles_per_actor
  ON public.storyflow_character_voice_profiles(actor_profile_id)
  WHERE actor_profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_profiles_per_entity
  ON public.storyflow_character_voice_profiles(universe_entity_id)
  WHERE universe_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_profiles_owner ON public.storyflow_character_voice_profiles(owner_id);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_entity ON public.storyflow_character_voice_profiles(universe_entity_id);

-- ============================================================
-- 2. storyflow_voice_lines
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_voice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voice_profile_id UUID NOT NULL REFERENCES public.storyflow_character_voice_profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'zh',
  ssml TEXT,
  project_id TEXT,
  scene_id TEXT,
  shot_id TEXT,
  latest_job_id UUID,
  asset_id UUID REFERENCES public.storyflow_assets(id) ON DELETE SET NULL,
  storage_path TEXT,
  signed_url TEXT,
  signed_url_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'ready', 'queued', 'generating', 'result_ingesting',
      'generated', 'approved', 'failed',
      'provider_timeout', 'moderation_blocked'
    )),
  error TEXT,
  last_failed_at TIMESTAMPTZ,
  duration_seconds NUMERIC(8,3),
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_lines_owner ON public.storyflow_voice_lines(owner_id);
CREATE INDEX IF NOT EXISTS idx_voice_lines_owner_status ON public.storyflow_voice_lines(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_voice_lines_profile ON public.storyflow_voice_lines(voice_profile_id);
CREATE INDEX IF NOT EXISTS idx_voice_lines_shot ON public.storyflow_voice_lines(shot_id) WHERE shot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_lines_project ON public.storyflow_voice_lines(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_lines_storage_path ON public.storyflow_voice_lines(storage_path) WHERE storage_path IS NOT NULL;

-- ============================================================
-- 3. RLS：owner-scoped
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = 'storyflow_character_voice_profiles' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE public.storyflow_character_voice_profiles ENABLE ROW LEVEL SECURITY;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = 'storyflow_voice_lines' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE public.storyflow_voice_lines ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS voice_profiles_owner_all ON public.storyflow_character_voice_profiles;
CREATE POLICY voice_profiles_owner_all
  ON public.storyflow_character_voice_profiles
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS voice_lines_owner_all ON public.storyflow_voice_lines;
CREATE POLICY voice_lines_owner_all
  ON public.storyflow_voice_lines
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ============================================================
-- 4. touch_updated_at trigger
-- ============================================================
DROP TRIGGER IF EXISTS voice_profiles_touch_updated_at ON public.storyflow_character_voice_profiles;
CREATE TRIGGER voice_profiles_touch_updated_at
  BEFORE UPDATE ON public.storyflow_character_voice_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS voice_lines_touch_updated_at ON public.storyflow_voice_lines;
CREATE TRIGGER voice_lines_touch_updated_at
  BEFORE UPDATE ON public.storyflow_voice_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.storyflow_character_voice_profiles IS
  'Voice Profile (TRAE-V2-03): actor or character voice config; provider-agnostic';
COMMENT ON TABLE public.storyflow_voice_lines IS
  'Voice Line (TRAE-V2-03): single dialogue TTS record; reuses storyflow_generation_jobs(job_type=audio, target_type=voice_line)';

COMMIT;
