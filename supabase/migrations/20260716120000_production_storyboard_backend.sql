-- Production Storyboard Backend: structured tables for production workbench
-- Depends on: 20260716000000_baseline.sql
-- Sub-project 2 of 11

-- Table 1: Production Projects (main table)
CREATE TABLE IF NOT EXISTS public.storyflow_production_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '未命名制片项目',
  workflow_type TEXT NOT NULL DEFAULT 'production'
    CHECK (workflow_type IN ('storyboard', 'video', 'production')),
  content_type TEXT NOT NULL DEFAULT 'short_drama'
    CHECK (content_type IN ('short_drama', 'mv')),
  aspect_ratio TEXT NOT NULL DEFAULT '9:16'
    CHECK (aspect_ratio IN ('9:16', '16:9', '1:1')),
  language TEXT NOT NULL DEFAULT 'zh'
    CHECK (language IN ('zh', 'en', 'bilingual')),
  universe_id UUID,
  mode TEXT NOT NULL DEFAULT 'planning'
    CHECK (mode IN ('planning', 'canvas', 'editor')),
  story_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  visual_bible JSONB NOT NULL DEFAULT '{}'::jsonb,
  providers JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_summary TEXT NOT NULL DEFAULT '',
  chat_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_shot_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: Production Shots (independent table for CRUD/sorting)
CREATE TABLE IF NOT EXISTS public.storyflow_production_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_project_id UUID NOT NULL
    REFERENCES public.storyflow_production_projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  index INTEGER NOT NULL DEFAULT 1,
  scene_title TEXT NOT NULL DEFAULT '',
  shot_type TEXT NOT NULL DEFAULT '普通画面',
  duration TEXT NOT NULL DEFAULT '5s',
  description TEXT NOT NULL DEFAULT '',
  composition TEXT NOT NULL DEFAULT '',
  camera_movement TEXT NOT NULL DEFAULT '',
  image_prompt TEXT NOT NULL DEFAULT '',
  video_prompt TEXT NOT NULL DEFAULT '',
  dialogue TEXT,
  sound TEXT,
  continuity TEXT,
  character_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  scene_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT,
  video_url TEXT,
  image_task_id TEXT,
  video_task_id TEXT,
  image_provider TEXT,
  video_provider TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'image_generating', 'image_ready',
                      'video_generating', 'video_ready', 'error')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_production_projects_owner_id
  ON public.storyflow_production_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_production_projects_project_id
  ON public.storyflow_production_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_production_shots_project_id_index
  ON public.storyflow_production_shots(production_project_id, index);
CREATE INDEX IF NOT EXISTS idx_production_shots_owner_id
  ON public.storyflow_production_shots(owner_id);

-- RLS
ALTER TABLE public.storyflow_production_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_production_shots ENABLE ROW LEVEL SECURITY;

-- RLS Policies: production_projects
CREATE POLICY "production_projects_owner_select"
  ON public.storyflow_production_projects FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "production_projects_owner_insert"
  ON public.storyflow_production_projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_projects_owner_update"
  ON public.storyflow_production_projects FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_projects_owner_delete"
  ON public.storyflow_production_projects FOR DELETE
  USING (owner_id = auth.uid());

-- RLS Policies: production_shots
CREATE POLICY "production_shots_owner_select"
  ON public.storyflow_production_shots FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "production_shots_owner_insert"
  ON public.storyflow_production_shots FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_shots_owner_update"
  ON public.storyflow_production_shots FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_shots_owner_delete"
  ON public.storyflow_production_shots FOR DELETE
  USING (owner_id = auth.uid());
