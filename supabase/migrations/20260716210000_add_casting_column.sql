-- Add casting JSONB column to production projects
ALTER TABLE public.storyflow_production_projects
  ADD COLUMN IF NOT EXISTS casting jsonb DEFAULT '{}'::jsonb NOT NULL;
