-- Kiikis audio generation upgrade.
-- Adds consent/audit fields for cloned voices and indexes audio job lookups.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-assets', 'audio-assets', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.storyflow_character_voice_profiles
  ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (consent_status IN ('not_required', 'pending', 'confirmed', 'revoked')),
  ADD COLUMN IF NOT EXISTS consent_source_asset_id UUID REFERENCES public.storyflow_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.storyflow_generation_jobs
  ADD COLUMN IF NOT EXISTS idempotency_hash TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_audio_generation_jobs_owner_status
  ON public.storyflow_generation_jobs(owner_id, status, created_at DESC)
  WHERE job_type = 'audio';

CREATE INDEX IF NOT EXISTS idx_audio_generation_jobs_target
  ON public.storyflow_generation_jobs(target_type, target_id, created_at DESC)
  WHERE job_type = 'audio';

CREATE UNIQUE INDEX IF NOT EXISTS uq_audio_generation_jobs_idempotency
  ON public.storyflow_generation_jobs(owner_id, idempotency_hash)
  WHERE job_type = 'audio'
    AND idempotency_hash IS NOT NULL
    AND status NOT IN ('failed', 'provider_timeout');

COMMENT ON COLUMN public.storyflow_character_voice_profiles.consent_status IS
  'Voice cloning consent lifecycle; confirmed is required before a cloned voice can generate.';
COMMENT ON COLUMN public.storyflow_generation_jobs.storage_path IS
  'Private Storage path for durable audio output; provider temporary URLs must not be persisted.';

COMMIT;
