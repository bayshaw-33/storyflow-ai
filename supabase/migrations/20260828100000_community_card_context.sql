-- K22 C0 community acceptance gaps
-- Keep source_type as the real storage resource type. Add the product-facing
-- subject/context layer without pretending milestone or showcase are tables.

ALTER TABLE public.storyflow_publications
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS source_workbench text,
  ADD COLUMN IF NOT EXISTS rights_summary text,
  ADD COLUMN IF NOT EXISTS contribution_summary text,
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS work_id text,
  ADD COLUMN IF NOT EXISTS work_type text,
  ADD COLUMN IF NOT EXISTS universe_id uuid;

DO $$
BEGIN
  ALTER TABLE public.storyflow_publications
    ADD CONSTRAINT storyflow_publications_subject_type_check
    CHECK (
      subject_type IS NULL OR subject_type IN (
        'work', 'universe', 'actor', 'asset', 'milestone', 'kk_showcase'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS storyflow_publications_work_id_idx
  ON public.storyflow_publications(work_id)
  WHERE work_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS storyflow_publications_project_id_idx
  ON public.storyflow_publications(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS storyflow_publications_subject_type_idx
  ON public.storyflow_publications(subject_type, created_at DESC)
  WHERE subject_type IS NOT NULL;

-- Backfill only stable Project -> Work relationships. Rights and contribution fields
-- remain explicitly unconfirmed until the publisher supplies them.
UPDATE public.storyflow_publications
SET project_id = source_id::text
WHERE source_type = 'project'
  AND project_id IS NULL;

UPDATE public.storyflow_publications AS publication
SET project_id = episode.project_id
FROM public.storyflow_episodes AS episode
WHERE publication.source_type = 'episode'
  AND publication.source_id = episode.id
  AND publication.project_id IS NULL;

UPDATE public.storyflow_publications AS publication
SET project_id = scene.project_id
FROM public.storyflow_scenes AS scene
WHERE publication.source_type = 'scene'
  AND publication.source_id = scene.id
  AND publication.project_id IS NULL;

UPDATE public.storyflow_publications AS publication
SET
  work_id = (
    SELECT work.id::text
    FROM public.storyflow_works AS work
    WHERE work.project_id = publication.project_id
    ORDER BY work.is_primary DESC, work.updated_at DESC, work.created_at DESC
    LIMIT 1
  ),
  work_type = (
    SELECT work.work_type
    FROM public.storyflow_works AS work
    WHERE work.project_id = publication.project_id
    ORDER BY work.is_primary DESC, work.updated_at DESC, work.created_at DESC
    LIMIT 1
  )
WHERE publication.project_id IS NOT NULL
  AND (publication.work_id IS NULL OR publication.work_type IS NULL);

-- Replace the original RPC so new publications can carry the context fields.
DROP FUNCTION IF EXISTS public.create_publication(text, uuid, text, text, text, text, text, text, text);

CREATE FUNCTION public.create_publication(
  p_source_type text,
  p_source_id uuid,
  p_source_version text,
  p_title text,
  p_summary text DEFAULT '',
  p_cover_url text DEFAULT NULL,
  p_visibility text DEFAULT 'public',
  p_invite_token_hash text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_subject_type text DEFAULT NULL,
  p_source_workbench text DEFAULT NULL,
  p_rights_summary text DEFAULT NULL,
  p_contribution_summary text DEFAULT NULL,
  p_work_id text DEFAULT NULL,
  p_universe_id uuid DEFAULT NULL
) RETURNS public.storyflow_publications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pub public.storyflow_publications;
  v_publisher uuid := auth.uid();
  v_project_id text;
  v_work_id text := NULLIF(p_work_id, '');
  v_work_type text;
  v_universe_id uuid := p_universe_id;
BEGIN
  IF v_publisher IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_subject_type IS NOT NULL AND p_subject_type NOT IN (
    'work', 'universe', 'actor', 'asset', 'milestone', 'kk_showcase'
  ) THEN
    RAISE EXCEPTION 'invalid subject_type';
  END IF;

  SELECT * INTO v_pub
  FROM public.storyflow_publications
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN v_pub;
  END IF;

  IF p_source_type = 'project' THEN
    v_project_id := p_source_id::text;
  ELSIF p_source_type = 'episode' THEN
    SELECT project_id INTO v_project_id
    FROM public.storyflow_episodes
    WHERE id = p_source_id;
  ELSIF p_source_type = 'scene' THEN
    SELECT project_id INTO v_project_id
    FROM public.storyflow_scenes
    WHERE id = p_source_id;
  END IF;

  IF v_work_id IS NOT NULL THEN
    SELECT project_id, work_type INTO v_project_id, v_work_type
    FROM public.storyflow_works
    WHERE id = v_work_id::uuid;
  ELSIF v_project_id IS NOT NULL THEN
    SELECT id::text, work_type INTO v_work_id, v_work_type
    FROM public.storyflow_works
    WHERE project_id = v_project_id
    ORDER BY is_primary DESC, updated_at DESC, created_at DESC
    LIMIT 1;
  END IF;

  IF v_universe_id IS NULL AND v_project_id IS NOT NULL THEN
    SELECT universe_id INTO v_universe_id
    FROM public.storyflow_projects
    WHERE id = v_project_id;
  END IF;

  INSERT INTO public.storyflow_publications (
    source_type, source_id, source_version, publisher_id,
    title, summary, cover_url, visibility, invite_token_hash, idempotency_key,
    subject_type, source_workbench, rights_summary, contribution_summary,
    project_id, work_id, work_type, universe_id
  ) VALUES (
    p_source_type, p_source_id, p_source_version, v_publisher,
    p_title, p_summary, p_cover_url, p_visibility, p_invite_token_hash, p_idempotency_key,
    p_subject_type, p_source_workbench, p_rights_summary, p_contribution_summary,
    v_project_id, v_work_id, v_work_type, v_universe_id
  )
  RETURNING * INTO v_pub;

  RETURN v_pub;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_publication(
  text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_publication(
  text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid
) TO authenticated;
