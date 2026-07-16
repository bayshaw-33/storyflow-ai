-- v4.0 规格核心表补建
-- 补建 Keyframe Slot 四层、Casting/Portrayal、Identity Passport 三层、
-- Assembly 顺片三表、Universe 分享、Story Stage、Creative Document Versions、
-- Export Archives (含 sha256)、Generation Job Targets、Input Assets
-- 并修改 generation_jobs (job_type + status 枚举扩展) 和 canon_check_reports (一致性检查单字段)

-- ============================================================
-- 1. 修改 storyflow_generation_jobs: 扩展 job_type 和 status 枚举
-- ============================================================

ALTER TABLE public.storyflow_generation_jobs DROP CONSTRAINT IF EXISTS storyflow_generation_jobs_job_type_check;
ALTER TABLE public.storyflow_generation_jobs ADD CONSTRAINT storyflow_generation_jobs_job_type_check
  CHECK (job_type IN ('image', 'video', 'audio', 'export', 'assembly'));

ALTER TABLE public.storyflow_generation_jobs DROP CONSTRAINT IF EXISTS storyflow_generation_jobs_status_check;
ALTER TABLE public.storyflow_generation_jobs ADD CONSTRAINT storyflow_generation_jobs_status_check
  CHECK (status IN (
    'draft', 'pending_confirm', 'queued', 'generating', 'result_ingesting',
    'completed', 'partial_failure', 'failed', 'cancel_requested', 'cancelled',
    'moderation_blocked', 'expired', 'needs_user_action', 'provider_timeout'
  ));

-- ============================================================
-- 2. 修改 storyflow_canon_check_reports: 加一致性检查单字段
-- ============================================================

ALTER TABLE public.storyflow_canon_check_reports
  ADD COLUMN IF NOT EXISTS check_type TEXT NOT NULL DEFAULT 'canon'
    CHECK (check_type IN ('canon', 'identity', 'appearance')),
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'p1'
    CHECK (severity IN ('p0', 'p1')),
  ADD COLUMN IF NOT EXISTS always_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_by_default BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS project_override_allowed BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- 3. Keyframe Slot 四层结构: Shot → Keyframe Set → Slot → Candidate
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_keyframe_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keyframe_sets_shot ON public.storyflow_keyframe_sets(shot_id);
CREATE INDEX IF NOT EXISTS idx_keyframe_sets_project ON public.storyflow_keyframe_sets(project_id);

CREATE TABLE IF NOT EXISTS public.storyflow_keyframe_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyframe_set_id UUID NOT NULL REFERENCES public.storyflow_keyframe_sets(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL,
  slot_role TEXT NOT NULL DEFAULT 'single'
    CHECK (slot_role IN ('single', 'start', 'intermediate', 'end')),
  timestamp_ratio NUMERIC(5,4) NOT NULL DEFAULT 0.0
    CHECK (timestamp_ratio >= 0 AND timestamp_ratio <= 1),
  selected_candidate_id UUID,
  label TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keyframe_slots_set ON public.storyflow_keyframe_slots(keyframe_set_id);
CREATE INDEX IF NOT EXISTS idx_keyframe_slots_shot ON public.storyflow_keyframe_slots(shot_id);

CREATE TABLE IF NOT EXISTS public.storyflow_keyframe_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyframe_slot_id UUID NOT NULL REFERENCES public.storyflow_keyframe_slots(id) ON DELETE CASCADE,
  image_url TEXT,
  prompt TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  provider TEXT,
  model TEXT,
  generation_job_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generating', 'ready', 'failed', 'archived')),
  is_selected BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keyframe_candidates_slot ON public.storyflow_keyframe_candidates(keyframe_slot_id);

-- selected_candidate_id 指向 candidate
ALTER TABLE public.storyflow_keyframe_slots
  ADD CONSTRAINT fk_keyframe_slots_selected_candidate
  FOREIGN KEY (selected_candidate_id) REFERENCES public.storyflow_keyframe_candidates(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.storyflow_keyframe_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_keyframe_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_keyframe_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY keyframe_sets_project_select ON public.storyflow_keyframe_sets FOR SELECT USING (true);
CREATE POLICY keyframe_sets_project_insert ON public.storyflow_keyframe_sets FOR INSERT WITH CHECK (true);
CREATE POLICY keyframe_sets_project_update ON public.storyflow_keyframe_sets FOR UPDATE USING (true);
CREATE POLICY keyframe_sets_project_delete ON public.storyflow_keyframe_sets FOR DELETE USING (true);

CREATE POLICY keyframe_slots_select ON public.storyflow_keyframe_slots FOR SELECT USING (true);
CREATE POLICY keyframe_slots_insert ON public.storyflow_keyframe_slots FOR INSERT WITH CHECK (true);
CREATE POLICY keyframe_slots_update ON public.storyflow_keyframe_slots FOR UPDATE USING (true);
CREATE POLICY keyframe_slots_delete ON public.storyflow_keyframe_slots FOR DELETE USING (true);

CREATE POLICY keyframe_candidates_select ON public.storyflow_keyframe_candidates FOR SELECT USING (true);
CREATE POLICY keyframe_candidates_insert ON public.storyflow_keyframe_candidates FOR INSERT WITH CHECK (true);
CREATE POLICY keyframe_candidates_update ON public.storyflow_keyframe_candidates FOR UPDATE USING (true);
CREATE POLICY keyframe_candidates_delete ON public.storyflow_keyframe_candidates FOR DELETE USING (true);

-- ============================================================
-- 4. Casting Assignment + Character Portrayal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_casting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  actor_profile_id UUID,
  pcv_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'standby', 'released')),
  notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_casting_assignments_project ON public.storyflow_casting_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_casting_assignments_character ON public.storyflow_casting_assignments(character_id);
CREATE INDEX IF NOT EXISTS idx_casting_assignments_actor ON public.storyflow_casting_assignments(actor_profile_id);

CREATE TABLE IF NOT EXISTS public.storyflow_character_portrayals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID NOT NULL,
  character_id TEXT NOT NULL,
  project_id TEXT,
  casting_assignment_id UUID REFERENCES public.storyflow_casting_assignments(id) ON DELETE SET NULL,
  portrayal_name TEXT NOT NULL DEFAULT '',
  visual_prompt TEXT NOT NULL DEFAULT '',
  costume_direction TEXT NOT NULL DEFAULT '',
  reference_image_url TEXT,
  is_reusable BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portrayals_actor ON public.storyflow_character_portrayals(actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_portrayals_character ON public.storyflow_character_portrayals(character_id);
CREATE INDEX IF NOT EXISTS idx_portrayals_project ON public.storyflow_character_portrayals(project_id);

ALTER TABLE public.storyflow_casting_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_character_portrayals ENABLE ROW LEVEL SECURITY;

CREATE POLICY casting_assignments_select ON public.storyflow_casting_assignments FOR SELECT USING (true);
CREATE POLICY casting_assignments_insert ON public.storyflow_casting_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY casting_assignments_update ON public.storyflow_casting_assignments FOR UPDATE USING (true);
CREATE POLICY casting_assignments_delete ON public.storyflow_casting_assignments FOR DELETE USING (true);

CREATE POLICY portrayals_select ON public.storyflow_character_portrayals FOR SELECT USING (true);
CREATE POLICY portrayals_insert ON public.storyflow_character_portrayals FOR INSERT WITH CHECK (true);
CREATE POLICY portrayals_update ON public.storyflow_character_portrayals FOR UPDATE USING (true);
CREATE POLICY portrayals_delete ON public.storyflow_character_portrayals FOR DELETE USING (true);

-- ============================================================
-- 5. Identity Passport 三层结构
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_identity_passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID NOT NULL,
  project_id TEXT,
  scene_id TEXT,
  -- 三层 prompt
  identity_core_prompt TEXT NOT NULL DEFAULT '',
  current_appearance_prompt TEXT NOT NULL DEFAULT '',
  scene_override_prompt TEXT NOT NULL DEFAULT '',
  -- 一致性检查单关联
  core_identity_locked BOOLEAN NOT NULL DEFAULT true,
  appearance_locked_by_default BOOLEAN NOT NULL DEFAULT true,
  project_override_allowed BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_passports_actor ON public.storyflow_identity_passports(actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_identity_passports_project ON public.storyflow_identity_passports(project_id);
CREATE INDEX IF NOT EXISTS idx_identity_passports_scene ON public.storyflow_identity_passports(scene_id);

ALTER TABLE public.storyflow_identity_passports ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_passports_select ON public.storyflow_identity_passports FOR SELECT USING (true);
CREATE POLICY identity_passports_insert ON public.storyflow_identity_passports FOR INSERT WITH CHECK (true);
CREATE POLICY identity_passports_update ON public.storyflow_identity_passports FOR UPDATE USING (true);
CREATE POLICY identity_passports_delete ON public.storyflow_identity_passports FOR DELETE USING (true);

-- ============================================================
-- 6. 自动顺片 Assembly: Sequence → Item → Shot + Selected Takes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_selected_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  take_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'alternate', 'discarded')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selected_takes_shot ON public.storyflow_selected_takes(shot_id);
CREATE INDEX IF NOT EXISTS idx_selected_takes_project ON public.storyflow_selected_takes(project_id);

CREATE TABLE IF NOT EXISTS public.storyflow_assembly_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Main Sequence',
  transition_type TEXT NOT NULL DEFAULT 'cut'
    CHECK (transition_type IN ('cut', 'crossfade', 'dissolve')),
  total_duration_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'exported')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assembly_sequences_project ON public.storyflow_assembly_sequences(project_id);

CREATE TABLE IF NOT EXISTS public.storyflow_assembly_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_sequence_id UUID NOT NULL REFERENCES public.storyflow_assembly_sequences(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL,
  selected_take_id UUID REFERENCES public.storyflow_selected_takes(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  start_time_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
  end_time_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
  transition_type TEXT NOT NULL DEFAULT 'cut'
    CHECK (transition_type IN ('cut', 'crossfade', 'dissolve')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assembly_items_sequence ON public.storyflow_assembly_items(assembly_sequence_id);
CREATE INDEX IF NOT EXISTS idx_assembly_items_shot ON public.storyflow_assembly_items(shot_id);

ALTER TABLE public.storyflow_selected_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_assembly_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_assembly_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY selected_takes_select ON public.storyflow_selected_takes FOR SELECT USING (true);
CREATE POLICY selected_takes_insert ON public.storyflow_selected_takes FOR INSERT WITH CHECK (true);
CREATE POLICY selected_takes_update ON public.storyflow_selected_takes FOR UPDATE USING (true);
CREATE POLICY selected_takes_delete ON public.storyflow_selected_takes FOR DELETE USING (true);

CREATE POLICY assembly_sequences_select ON public.storyflow_assembly_sequences FOR SELECT USING (true);
CREATE POLICY assembly_sequences_insert ON public.storyflow_assembly_sequences FOR INSERT WITH CHECK (true);
CREATE POLICY assembly_sequences_update ON public.storyflow_assembly_sequences FOR UPDATE USING (true);
CREATE POLICY assembly_sequences_delete ON public.storyflow_assembly_sequences FOR DELETE USING (true);

CREATE POLICY assembly_items_select ON public.storyflow_assembly_items FOR SELECT USING (true);
CREATE POLICY assembly_items_insert ON public.storyflow_assembly_items FOR INSERT WITH CHECK (true);
CREATE POLICY assembly_items_update ON public.storyflow_assembly_items FOR UPDATE USING (true);
CREATE POLICY assembly_items_delete ON public.storyflow_assembly_items FOR DELETE USING (true);

-- ============================================================
-- 7. Universe 分享功能
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_universe_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id UUID NOT NULL,
  shared_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE,
  access_level TEXT NOT NULL DEFAULT 'view'
    CHECK (access_level IN ('view', 'comment', 'edit')),
  sync_mode TEXT NOT NULL DEFAULT 'follow_latest'
    CHECK (sync_mode IN ('pinned', 'follow_latest')),
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_universe_shares_universe ON public.storyflow_universe_shares(universe_id);
CREATE INDEX IF NOT EXISTS idx_universe_shares_shared_with ON public.storyflow_universe_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_universe_shares_token ON public.storyflow_universe_shares(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE public.storyflow_universe_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY universe_shares_select ON public.storyflow_universe_shares FOR SELECT USING (
  shared_by_user_id = auth.uid() OR shared_with_user_id = auth.uid()
);
CREATE POLICY universe_shares_insert ON public.storyflow_universe_shares FOR INSERT WITH CHECK (shared_by_user_id = auth.uid());
CREATE POLICY universe_shares_update ON public.storyflow_universe_shares FOR UPDATE USING (shared_by_user_id = auth.uid());
CREATE POLICY universe_shares_delete ON public.storyflow_universe_shares FOR DELETE USING (shared_by_user_id = auth.uid());

-- ============================================================
-- 8. Story Stage 叙事弧线
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_story_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  season_id UUID,
  name TEXT NOT NULL DEFAULT '',
  stage_type TEXT NOT NULL DEFAULT 'setup'
    CHECK (stage_type IN ('setup', 'rising_action', 'climax', 'falling_action', 'resolution')),
  sort_order INT NOT NULL DEFAULT 0,
  episode_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  workflow_status TEXT NOT NULL DEFAULT 'planning'
    CHECK (workflow_status IN ('planning', 'drafting', 'in_review', 'completed', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_stages_project ON public.storyflow_story_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_story_stages_season ON public.storyflow_story_stages(season_id);

ALTER TABLE public.storyflow_story_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY story_stages_select ON public.storyflow_story_stages FOR SELECT USING (true);
CREATE POLICY story_stages_insert ON public.storyflow_story_stages FOR INSERT WITH CHECK (true);
CREATE POLICY story_stages_update ON public.storyflow_story_stages FOR UPDATE USING (true);
CREATE POLICY story_stages_delete ON public.storyflow_story_stages FOR DELETE USING (true);

-- ============================================================
-- 9. Creative Document 版本管理
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_creative_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_document_id UUID NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  document_type TEXT NOT NULL DEFAULT 'novel'
    CHECK (document_type IN ('worldbuilding', 'character_bible', 'outline', 'novel', 'script', 'localization', 'director_notes')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  diff_from_previous JSONB,
  word_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_doc_versions_doc ON public.storyflow_creative_document_versions(creative_document_id);
CREATE INDEX IF NOT EXISTS idx_creative_doc_versions_type ON public.storyflow_creative_document_versions(document_type);

ALTER TABLE public.storyflow_creative_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY creative_doc_versions_select ON public.storyflow_creative_document_versions FOR SELECT USING (true);
CREATE POLICY creative_doc_versions_insert ON public.storyflow_creative_document_versions FOR INSERT WITH CHECK (true);
CREATE POLICY creative_doc_versions_update ON public.storyflow_creative_document_versions FOR UPDATE USING (true);
CREATE POLICY creative_doc_versions_delete ON public.storyflow_creative_document_versions FOR DELETE USING (true);

-- ============================================================
-- 10. Export Archives（创作档案导出 + sha256 + 档案链）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_export_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archive_schema_version TEXT NOT NULL DEFAULT '1',
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  previous_archive_id UUID REFERENCES public.storyflow_export_archives(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'verified', 'corrupted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_archives_project ON public.storyflow_export_archives(project_id);
CREATE INDEX IF NOT EXISTS idx_export_archives_owner ON public.storyflow_export_archives(owner_id);
CREATE INDEX IF NOT EXISTS idx_export_archives_previous ON public.storyflow_export_archives(previous_archive_id) WHERE previous_archive_id IS NOT NULL;

ALTER TABLE public.storyflow_export_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY export_archives_owner_select ON public.storyflow_export_archives FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY export_archives_owner_insert ON public.storyflow_export_archives FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY export_archives_owner_update ON public.storyflow_export_archives FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY export_archives_owner_delete ON public.storyflow_export_archives FOR DELETE USING (owner_id = auth.uid());

-- ============================================================
-- 11. Generation Job Targets 关系表 + Input Assets 输入冻结
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_generation_job_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_job_id UUID NOT NULL REFERENCES public.storyflow_generation_jobs(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary'
    CHECK (role IN ('primary', 'reference', 'input', 'output')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gen_job_targets_job ON public.storyflow_generation_job_targets(generation_job_id);
CREATE INDEX IF NOT EXISTS idx_gen_job_targets_target ON public.storyflow_generation_job_targets(target_type, target_id);

ALTER TABLE public.storyflow_generation_job_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY gen_job_targets_select ON public.storyflow_generation_job_targets FOR SELECT USING (true);
CREATE POLICY gen_job_targets_insert ON public.storyflow_generation_job_targets FOR INSERT WITH CHECK (true);
CREATE POLICY gen_job_targets_delete ON public.storyflow_generation_job_targets FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.storyflow_input_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_job_id UUID NOT NULL REFERENCES public.storyflow_generation_jobs(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  asset_hash TEXT,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_input_assets_job ON public.storyflow_input_assets(generation_job_id);

ALTER TABLE public.storyflow_input_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY input_assets_select ON public.storyflow_input_assets FOR SELECT USING (true);
CREATE POLICY input_assets_insert ON public.storyflow_input_assets FOR INSERT WITH CHECK (true);
CREATE POLICY input_assets_delete ON public.storyflow_input_assets FOR DELETE USING (true);

-- ============================================================
-- 12. updated_at triggers
-- ============================================================

CREATE TRIGGER keyframe_sets_touch_updated_at
  BEFORE UPDATE ON public.storyflow_keyframe_sets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER keyframe_slots_touch_updated_at
  BEFORE UPDATE ON public.storyflow_keyframe_slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER keyframe_candidates_touch_updated_at
  BEFORE UPDATE ON public.storyflow_keyframe_candidates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER casting_assignments_touch_updated_at
  BEFORE UPDATE ON public.storyflow_casting_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER character_portrayals_touch_updated_at
  BEFORE UPDATE ON public.storyflow_character_portrayals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER identity_passports_touch_updated_at
  BEFORE UPDATE ON public.storyflow_identity_passports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER selected_takes_touch_updated_at
  BEFORE UPDATE ON public.storyflow_selected_takes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER assembly_sequences_touch_updated_at
  BEFORE UPDATE ON public.storyflow_assembly_sequences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER story_stages_touch_updated_at
  BEFORE UPDATE ON public.storyflow_story_stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER universe_shares_touch_updated_at
  BEFORE UPDATE ON public.storyflow_universe_shares
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
