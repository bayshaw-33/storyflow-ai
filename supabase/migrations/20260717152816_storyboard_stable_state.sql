-- Phase 1 storyboard current state.
-- Current state is scoped by owner + project + source unit. Versions stay immutable.

ALTER TABLE public.storyflow_production_projects
  ADD COLUMN IF NOT EXISTS source_unit_id text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS storyflow_production_projects_active_scope_key
  ON public.storyflow_production_projects (owner_id, project_id, source_unit_id)
  WHERE source_unit_id <> 'legacy';

ALTER TABLE public.storyflow_production_projects
  DROP CONSTRAINT IF EXISTS storyflow_production_projects_mode_check,
  ADD CONSTRAINT storyflow_production_projects_mode_check
    CHECK (mode IN ('planning', 'canvas', 'editor', 'assembly', 'casting'));

CREATE TABLE IF NOT EXISTS public.storyflow_production_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_project_id uuid NOT NULL REFERENCES public.storyflow_production_projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_unit_id text NOT NULL,
  sort_order integer NOT NULL,
  heading text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  time_of_day text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  source_text text NOT NULL DEFAULT '',
  source_range jsonb,
  character_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  prop_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked boolean NOT NULL DEFAULT false,
  user_edited boolean NOT NULL DEFAULT false,
  confirmed boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0,
  analysis_version integer NOT NULL DEFAULT 0,
  source_hash text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storyflow_production_shots
  ADD COLUMN IF NOT EXISTS scene_id uuid REFERENCES public.storyflow_production_scenes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_unit_id text,
  ADD COLUMN IF NOT EXISTS source_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS story_beat text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visual_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scene_asset_id text,
  ADD COLUMN IF NOT EXISTS prop_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shot_size text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS angle text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration_seconds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emotion text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS jimeng_prompt_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS jimeng_prompt_en text,
  ADD COLUMN IF NOT EXISTS storyboard_image_version_id text,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_production_scenes_active_scope
  ON public.storyflow_production_scenes (production_project_id, sort_order)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_production_shots_active_scene
  ON public.storyflow_production_shots (production_project_id, scene_id, index)
  WHERE deleted_at IS NULL;

ALTER TABLE public.storyflow_production_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_scenes_owner_select ON public.storyflow_production_scenes;
CREATE POLICY production_scenes_owner_select ON public.storyflow_production_scenes
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS production_projects_owner_select ON public.storyflow_production_projects;
CREATE POLICY production_projects_owner_select ON public.storyflow_production_projects
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS production_shots_owner_select ON public.storyflow_production_shots;
CREATE POLICY production_shots_owner_select ON public.storyflow_production_shots
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

REVOKE ALL ON public.storyflow_production_projects FROM anon;
REVOKE ALL ON public.storyflow_production_scenes FROM anon;
REVOKE ALL ON public.storyflow_production_shots FROM anon;
GRANT SELECT ON public.storyflow_production_projects TO authenticated;
GRANT SELECT ON public.storyflow_production_scenes TO authenticated;
GRANT SELECT ON public.storyflow_production_shots TO authenticated;
GRANT ALL ON public.storyflow_production_projects TO service_role;
GRANT ALL ON public.storyflow_production_scenes TO service_role;
GRANT ALL ON public.storyflow_production_shots TO service_role;

CREATE OR REPLACE FUNCTION public.save_storyboard_state(
  p_owner_id uuid,
  p_project_id text,
  p_source_unit_id text,
  p_expected_revision integer,
  p_scenes jsonb,
  p_deleted_scene_ids jsonb DEFAULT '[]'::jsonb,
  p_deleted_shot_ids jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_production_project_id uuid;
  v_current_revision integer;
  v_next_revision integer;
  v_scene jsonb;
  v_shot jsonb;
  v_scene_id uuid;
  v_shot_id uuid;
  v_client_id text;
  v_id_map jsonb := '{}'::jsonb;
  v_scenes jsonb;
BEGIN
  IF p_expected_revision < 0 OR p_source_unit_id = '' OR p_source_unit_id = 'legacy' THEN
    RAISE EXCEPTION 'STORYBOARD_INVALID_SAVE_REQUEST';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.storyflow_projects
    WHERE id = p_project_id
      AND COALESCE(owner_id, user_id) = p_owner_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STORYBOARD_PROJECT_NOT_FOUND';
  END IF;

  INSERT INTO public.storyflow_production_projects (project_id, owner_id, source_unit_id)
  VALUES (p_project_id, p_owner_id, p_source_unit_id)
  ON CONFLICT (owner_id, project_id, source_unit_id) WHERE source_unit_id <> 'legacy' DO NOTHING;

  SELECT id, revision
    INTO v_production_project_id, v_current_revision
  FROM public.storyflow_production_projects
  WHERE owner_id = p_owner_id
    AND project_id = p_project_id
    AND source_unit_id = p_source_unit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORYBOARD_SCOPE_VIOLATION';
  END IF;

  IF v_current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'REVISION_CONFLICT:%', v_current_revision;
  END IF;

  v_next_revision := v_current_revision + 1;
  UPDATE public.storyflow_production_projects
  SET revision = v_next_revision, updated_at = now()
  WHERE id = v_production_project_id;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p_deleted_scene_ids) AS deleted(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.storyflow_production_scenes scene
      WHERE scene.id::text = deleted.id
        AND scene.production_project_id = v_production_project_id
        AND scene.owner_id = p_owner_id
    )
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p_deleted_shot_ids) AS deleted(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.storyflow_production_shots shot
      WHERE shot.id::text = deleted.id
        AND shot.production_project_id = v_production_project_id
        AND shot.owner_id = p_owner_id
    )
  ) THEN
    RAISE EXCEPTION 'STORYBOARD_SCOPE_VIOLATION';
  END IF;

  UPDATE public.storyflow_production_scenes
  SET deleted_at = now(), revision = v_next_revision, updated_at = now()
  WHERE production_project_id = v_production_project_id
    AND id::text IN (SELECT value FROM jsonb_array_elements_text(p_deleted_scene_ids));
  UPDATE public.storyflow_production_shots
  SET deleted_at = now(), revision = v_next_revision, updated_at = now()
  WHERE production_project_id = v_production_project_id
    AND scene_id IN (
      SELECT id FROM public.storyflow_production_scenes
      WHERE production_project_id = v_production_project_id
        AND id::text IN (SELECT value FROM jsonb_array_elements_text(p_deleted_scene_ids))
    );
  UPDATE public.storyflow_production_shots
  SET deleted_at = now(), revision = v_next_revision, updated_at = now()
  WHERE production_project_id = v_production_project_id
    AND id::text IN (SELECT value FROM jsonb_array_elements_text(p_deleted_shot_ids));

  FOR v_scene IN SELECT value FROM jsonb_array_elements(p_scenes)
  LOOP
    IF v_scene->>'idSource' = 'server' THEN
      v_scene_id := (v_scene->>'id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.storyflow_production_scenes
        WHERE id = v_scene_id AND production_project_id = v_production_project_id AND owner_id = p_owner_id
      ) THEN RAISE EXCEPTION 'STORYBOARD_SCOPE_VIOLATION'; END IF;
    ELSIF v_scene->>'idSource' = 'client' AND NULLIF(v_scene->>'clientId', '') IS NOT NULL THEN
      v_scene_id := gen_random_uuid();
    ELSE
      RAISE EXCEPTION 'STORYBOARD_INVALID_SCENE_ID';
    END IF;

    v_client_id := NULLIF(v_scene->>'clientId', '');
    IF v_client_id IS NOT NULL THEN v_id_map := v_id_map || jsonb_build_object(v_client_id, v_scene_id::text); END IF;

    INSERT INTO public.storyflow_production_scenes (
      id, production_project_id, owner_id, source_unit_id, sort_order, heading, location, time_of_day,
      summary, source_text, source_range, character_asset_ids, prop_asset_ids, locked, user_edited,
      confirmed, revision, analysis_version, source_hash, deleted_at, updated_at
    ) VALUES (
      v_scene_id, v_production_project_id, p_owner_id, p_source_unit_id, COALESCE((v_scene->>'order')::integer, 0),
      COALESCE(v_scene->>'heading', ''), COALESCE(v_scene->>'location', ''), COALESCE(v_scene->>'timeOfDay', ''),
      COALESCE(v_scene->>'summary', ''), COALESCE(v_scene->>'sourceText', ''), v_scene->'sourceRange',
      COALESCE(v_scene->'characterAssetIds', '[]'::jsonb), COALESCE(v_scene->'propAssetIds', '[]'::jsonb),
      COALESCE((v_scene->>'locked')::boolean, false), COALESCE((v_scene->>'userEdited')::boolean, false),
      COALESCE((v_scene->>'confirmed')::boolean, false), v_next_revision,
      COALESCE((v_scene->>'analysisVersion')::integer, 0), COALESCE(v_scene->>'sourceHash', ''), NULL, now()
    ) ON CONFLICT (id) DO UPDATE SET
      sort_order = EXCLUDED.sort_order, heading = EXCLUDED.heading, location = EXCLUDED.location,
      time_of_day = EXCLUDED.time_of_day, summary = EXCLUDED.summary, source_text = EXCLUDED.source_text,
      source_range = EXCLUDED.source_range, character_asset_ids = EXCLUDED.character_asset_ids,
      prop_asset_ids = EXCLUDED.prop_asset_ids, locked = EXCLUDED.locked, user_edited = EXCLUDED.user_edited,
      confirmed = EXCLUDED.confirmed, revision = EXCLUDED.revision, analysis_version = EXCLUDED.analysis_version,
      source_hash = EXCLUDED.source_hash, deleted_at = NULL, updated_at = now();

    FOR v_shot IN SELECT value FROM jsonb_array_elements(COALESCE(v_scene->'shots', '[]'::jsonb))
    LOOP
      IF v_shot->>'idSource' = 'server' THEN
        v_shot_id := (v_shot->>'id')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.storyflow_production_shots
          WHERE id = v_shot_id AND production_project_id = v_production_project_id AND owner_id = p_owner_id
        ) THEN RAISE EXCEPTION 'STORYBOARD_SCOPE_VIOLATION'; END IF;
      ELSIF v_shot->>'idSource' = 'client' AND NULLIF(v_shot->>'clientId', '') IS NOT NULL THEN
        v_shot_id := gen_random_uuid();
      ELSE
        RAISE EXCEPTION 'STORYBOARD_INVALID_SHOT_ID';
      END IF;

      v_client_id := NULLIF(v_shot->>'clientId', '');
      IF v_client_id IS NOT NULL THEN v_id_map := v_id_map || jsonb_build_object(v_client_id, v_shot_id::text); END IF;

      INSERT INTO public.storyflow_production_shots (
        id, production_project_id, owner_id, index, scene_id, source_unit_id, scene_title, source_text,
        story_beat, visual_description, description, character_refs, scene_asset_id, prop_asset_ids, shot_size,
        camera_movement, angle, duration_seconds, duration, dialogue, continuity, emotion, image_prompt,
        jimeng_prompt_zh, jimeng_prompt_en, storyboard_image_version_id, locked, user_edited, confirmed,
        revision, analysis_version, source_hash, deleted_at, status, updated_at
      ) VALUES (
        v_shot_id, v_production_project_id, p_owner_id, COALESCE((v_shot->>'order')::integer, 0), v_scene_id,
        p_source_unit_id, COALESCE(v_scene->>'heading', ''), COALESCE(v_shot->>'sourceText', ''),
        COALESCE(v_shot->>'storyBeat', ''), COALESCE(v_shot->>'visualDescription', ''), COALESCE(v_shot->>'visualDescription', ''),
        COALESCE(v_shot->'characterAssetIds', '[]'::jsonb), NULLIF(v_shot->>'sceneAssetId', ''),
        COALESCE(v_shot->'propAssetIds', '[]'::jsonb), COALESCE(v_shot->>'shotSize', ''),
        COALESCE(v_shot->>'cameraMovement', ''), COALESCE(v_shot->>'angle', ''),
        COALESCE((v_shot->>'durationSeconds')::numeric, 0), CONCAT(COALESCE(v_shot->>'durationSeconds', '0'), 's'),
        NULLIF(v_shot->>'dialogue', ''), NULLIF(v_shot->>'continuity', ''), COALESCE(v_shot->>'emotion', ''),
        COALESCE(v_shot->>'imagePrompt', ''), COALESCE(v_shot->>'jimengPromptZh', ''), NULLIF(v_shot->>'jimengPromptEn', ''),
        NULLIF(v_shot->>'storyboardImageVersionId', ''), COALESCE((v_shot->>'locked')::boolean, false),
        COALESCE((v_shot->>'userEdited')::boolean, false), COALESCE((v_shot->>'confirmed')::boolean, false),
        v_next_revision, COALESCE((v_shot->>'analysisVersion')::integer, 0), COALESCE(v_shot->>'sourceHash', ''),
        NULL, 'draft', now()
      ) ON CONFLICT (id) DO UPDATE SET
        index = EXCLUDED.index, scene_id = EXCLUDED.scene_id, source_unit_id = EXCLUDED.source_unit_id,
        scene_title = EXCLUDED.scene_title, source_text = EXCLUDED.source_text, story_beat = EXCLUDED.story_beat,
        visual_description = EXCLUDED.visual_description, description = EXCLUDED.description,
        character_refs = EXCLUDED.character_refs, scene_asset_id = EXCLUDED.scene_asset_id,
        prop_asset_ids = EXCLUDED.prop_asset_ids, shot_size = EXCLUDED.shot_size,
        camera_movement = EXCLUDED.camera_movement, angle = EXCLUDED.angle,
        duration_seconds = EXCLUDED.duration_seconds, duration = EXCLUDED.duration, dialogue = EXCLUDED.dialogue,
        continuity = EXCLUDED.continuity, emotion = EXCLUDED.emotion, image_prompt = EXCLUDED.image_prompt,
        jimeng_prompt_zh = EXCLUDED.jimeng_prompt_zh, jimeng_prompt_en = EXCLUDED.jimeng_prompt_en,
        storyboard_image_version_id = EXCLUDED.storyboard_image_version_id, locked = EXCLUDED.locked,
        user_edited = EXCLUDED.user_edited, confirmed = EXCLUDED.confirmed, revision = EXCLUDED.revision,
        analysis_version = EXCLUDED.analysis_version, source_hash = EXCLUDED.source_hash, deleted_at = NULL,
        updated_at = now();
    END LOOP;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', scene.id::text, 'idSource', 'server', 'order', scene.sort_order, 'heading', scene.heading,
    'location', scene.location, 'timeOfDay', scene.time_of_day, 'summary', scene.summary,
    'sourceText', scene.source_text, 'sourceRange', scene.source_range,
    'characterAssetIds', scene.character_asset_ids, 'propAssetIds', scene.prop_asset_ids,
    'locked', scene.locked, 'userEdited', scene.user_edited, 'confirmed', scene.confirmed,
    'revision', scene.revision, 'analysisVersion', scene.analysis_version, 'sourceHash', scene.source_hash,
    'shots', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', shot.id::text, 'idSource', 'server', 'sceneId', scene.id::text, 'order', shot.index,
      'sourceText', shot.source_text, 'storyBeat', shot.story_beat, 'visualDescription', shot.visual_description,
      'characterAssetIds', shot.character_refs, 'sceneAssetId', shot.scene_asset_id,
      'propAssetIds', shot.prop_asset_ids, 'shotSize', shot.shot_size,
      'cameraMovement', shot.camera_movement, 'angle', shot.angle, 'durationSeconds', shot.duration_seconds,
      'dialogue', COALESCE(shot.dialogue, ''), 'emotion', shot.emotion, 'continuity', COALESCE(shot.continuity, ''),
      'imagePrompt', shot.image_prompt, 'jimengPromptZh', shot.jimeng_prompt_zh,
      'jimengPromptEn', shot.jimeng_prompt_en, 'storyboardImageVersionId', shot.storyboard_image_version_id,
      'locked', shot.locked, 'userEdited', shot.user_edited, 'confirmed', shot.confirmed,
      'revision', shot.revision, 'analysisVersion', shot.analysis_version, 'sourceHash', shot.source_hash
    ) ORDER BY shot.index)
    FROM public.storyflow_production_shots shot
    WHERE shot.scene_id = scene.id AND shot.deleted_at IS NULL), '[]'::jsonb)
  ) ORDER BY scene.sort_order), '[]'::jsonb)
  INTO v_scenes
  FROM public.storyflow_production_scenes scene
  WHERE scene.production_project_id = v_production_project_id AND scene.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'sourceUnitId', p_source_unit_id,
    'revision', v_next_revision,
    'scenes', v_scenes,
    'idMap', v_id_map
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_storyboard_state(uuid, text, text, integer, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_storyboard_state(uuid, text, text, integer, jsonb, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.save_storyboard_state(uuid, text, text, integer, jsonb, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_storyboard_state(uuid, text, text, integer, jsonb, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_storyboard_state(
  p_owner_id uuid,
  p_project_id text,
  p_source_unit_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_production_project_id uuid;
  v_revision integer;
  v_scenes jsonb;
BEGIN
  SELECT id, revision INTO v_production_project_id, v_revision
  FROM public.storyflow_production_projects
  WHERE owner_id = p_owner_id AND project_id = p_project_id AND source_unit_id = p_source_unit_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', scene.id::text, 'idSource', 'server', 'order', scene.sort_order, 'heading', scene.heading,
    'location', scene.location, 'timeOfDay', scene.time_of_day, 'summary', scene.summary,
    'sourceText', scene.source_text, 'sourceRange', scene.source_range,
    'characterAssetIds', scene.character_asset_ids, 'propAssetIds', scene.prop_asset_ids,
    'locked', scene.locked, 'userEdited', scene.user_edited, 'confirmed', scene.confirmed,
    'revision', scene.revision, 'analysisVersion', scene.analysis_version, 'sourceHash', scene.source_hash,
    'shots', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', shot.id::text, 'idSource', 'server', 'sceneId', scene.id::text, 'order', shot.index,
      'sourceText', shot.source_text, 'storyBeat', shot.story_beat, 'visualDescription', shot.visual_description,
      'characterAssetIds', shot.character_refs, 'sceneAssetId', shot.scene_asset_id,
      'propAssetIds', shot.prop_asset_ids, 'shotSize', shot.shot_size,
      'cameraMovement', shot.camera_movement, 'angle', shot.angle, 'durationSeconds', shot.duration_seconds,
      'dialogue', COALESCE(shot.dialogue, ''), 'emotion', shot.emotion, 'continuity', COALESCE(shot.continuity, ''),
      'imagePrompt', shot.image_prompt, 'jimengPromptZh', shot.jimeng_prompt_zh,
      'jimengPromptEn', shot.jimeng_prompt_en, 'storyboardImageVersionId', shot.storyboard_image_version_id,
      'locked', shot.locked, 'userEdited', shot.user_edited, 'confirmed', shot.confirmed,
      'revision', shot.revision, 'analysisVersion', shot.analysis_version, 'sourceHash', shot.source_hash
    ) ORDER BY shot.index)
    FROM public.storyflow_production_shots shot
    WHERE shot.scene_id = scene.id AND shot.deleted_at IS NULL), '[]'::jsonb)
  ) ORDER BY scene.sort_order), '[]'::jsonb)
  INTO v_scenes
  FROM public.storyflow_production_scenes scene
  WHERE scene.production_project_id = v_production_project_id AND scene.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'sourceUnitId', p_source_unit_id,
    'revision', v_revision,
    'scenes', v_scenes,
    'idMap', '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_storyboard_state(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_storyboard_state(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_storyboard_state(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_storyboard_state(uuid, text, text) TO service_role;
