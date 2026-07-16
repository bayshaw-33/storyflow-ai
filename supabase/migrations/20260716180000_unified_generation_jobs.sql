-- Unified Generation Jobs Table
-- Consolidates image, video, and audio generation tracking into one queue
-- Replaces the orphaned storyflow_art_generation_jobs and complements storyflow_generation_tasks (text AI)

CREATE TABLE IF NOT EXISTS public.storyflow_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Job classification
  job_type TEXT NOT NULL CHECK (job_type IN ('image', 'video', 'audio')),
  provider TEXT NOT NULL,           -- 'minimax' | 'atlas' | 'flux' | 'seedance' | 'runway' | 'kling' | 'seedream' | 'suno' | etc
  model TEXT,                       -- specific model name/ID
  
  -- Provider task tracking
  provider_task_id TEXT,            -- external task ID from the provider
  
  -- Input
  prompt TEXT NOT NULL DEFAULT '',
  input_params JSONB NOT NULL DEFAULT '{}'::jsonb,  -- aspect_ratio, reference_urls, duration, etc
  
  -- Status
  status TEXT NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  error TEXT,
  
  -- Result
  result_url TEXT,                  -- generated media URL (image/video/audio)
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,  -- extra info: width, height, duration, seed, etc
  
  -- Target linkage (polymorphic)
  target_type TEXT NOT NULL DEFAULT 'standalone',  -- 'production_shot' | 'art_asset' | 'art_variant' | 'standalone'
  target_id TEXT,                                   -- UUID or ID of the target entity
  project_id TEXT,                                  -- optional project context
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generation_jobs_owner_id ON public.storyflow_generation_jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_owner_status ON public.storyflow_generation_jobs(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_target ON public.storyflow_generation_jobs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_provider_task ON public.storyflow_generation_jobs(provider_task_id) WHERE provider_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at ON public.storyflow_generation_jobs(owner_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.storyflow_generation_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (owner-scoped)
CREATE POLICY generation_jobs_owner_select ON public.storyflow_generation_jobs
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY generation_jobs_owner_insert ON public.storyflow_generation_jobs
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY generation_jobs_owner_update ON public.storyflow_generation_jobs
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY generation_jobs_owner_delete ON public.storyflow_generation_jobs
  FOR DELETE USING (owner_id = auth.uid());

-- Updated_at trigger (reuse the existing pattern if available, or create one)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generation_jobs_touch_updated_at
  BEFORE UPDATE ON public.storyflow_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
