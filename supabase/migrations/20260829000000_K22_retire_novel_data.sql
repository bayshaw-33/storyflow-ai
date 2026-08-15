-- K22: retire the novel workflow.
--
-- This migration is deliberately scoped to explicit novel markers. It removes
-- retired novel projects and their project/work-scoped children, but preserves
-- every non-novel project, Universe, asset, account, and unrelated task.

CREATE TEMP TABLE _kiikis_retired_novel_projects (
  id text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _kiikis_retired_novel_projects (id)
SELECT p.id
FROM public.storyflow_projects AS p
WHERE p.workflow_type = 'novel'
   OR p.mode = 'novel'
   OR p.data ->> 'workflowType' = 'novel'
   OR p.data ->> 'contentType' = 'novel'
   OR p.data ->> 'workType' = 'novel'
   OR p.data ->> 'workflow_type' = 'novel'
   OR p.data ->> 'content_type' = 'novel'
   OR p.data ->> 'work_type' = 'novel';

CREATE TEMP TABLE _kiikis_retired_novel_works (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _kiikis_retired_novel_works (id)
SELECT w.id
FROM public.storyflow_works AS w
WHERE w.work_type = 'novel'
   OR w.project_id IN (SELECT id FROM _kiikis_retired_novel_projects);

CREATE TEMP TABLE _kiikis_retired_novel_generation_tasks (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _kiikis_retired_novel_generation_tasks (id)
SELECT t.id
FROM public.storyflow_generation_tasks AS t
WHERE t.project_id IN (SELECT id FROM _kiikis_retired_novel_projects)
   OR t.step_key LIKE 'novel\_%' ESCAPE '\'
   OR t.phase_key LIKE 'novel\_%' ESCAPE '\';

CREATE TEMP TABLE _kiikis_retired_novel_generation_jobs (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _kiikis_retired_novel_generation_jobs (id)
SELECT j.id
FROM public.storyflow_generation_jobs AS j
WHERE j.project_id IN (SELECT id FROM _kiikis_retired_novel_projects)
   OR j.job_type LIKE 'novel\_%' ESCAPE '\';

CREATE TEMP TABLE _kiikis_retired_novel_evidence_cases (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _kiikis_retired_novel_evidence_cases (id)
SELECT c.id
FROM public.storyflow_evidence_cases AS c
WHERE c.project_id IN (SELECT id FROM _kiikis_retired_novel_projects);

DO $$
DECLARE
  preserved_projects bigint;
  preserved_works bigint;
  preserved_universes bigint;
  preserved_assets bigint;
BEGIN
  SELECT count(*) INTO preserved_projects
  FROM public.storyflow_projects AS p
  WHERE p.id NOT IN (SELECT id FROM _kiikis_retired_novel_projects);

  SELECT count(*) INTO preserved_works
  FROM public.storyflow_works AS w
  WHERE w.id NOT IN (SELECT id FROM _kiikis_retired_novel_works);

  SELECT count(*) INTO preserved_universes FROM public.storyflow_universes;
  SELECT count(*) INTO preserved_assets FROM public.storyflow_assets;

  -- These tables are not all FK-linked to the legacy project tables, so remove
  -- their rows through explicit project/work/task markers first.
  DELETE FROM public.storyflow_task_events AS e
  WHERE e.task_id IN (SELECT id FROM _kiikis_retired_novel_generation_tasks)
     OR e.task_id IN (SELECT id FROM _kiikis_retired_novel_generation_jobs);

  DELETE FROM public.storyflow_task_assignments AS a
  WHERE a.project_id::text IN (SELECT id FROM _kiikis_retired_novel_projects)
     OR a.task_id IN (SELECT id FROM _kiikis_retired_novel_generation_tasks)
     OR a.task_id IN (SELECT id FROM _kiikis_retired_novel_generation_jobs);

  DELETE FROM public.storyflow_creative_events AS e
  WHERE e.task_id IN (SELECT id FROM _kiikis_retired_novel_generation_tasks)
     OR e.resource_type = 'project'
        AND e.resource_id IN (SELECT id FROM _kiikis_retired_novel_projects)
     OR e.resource_type = 'work'
        AND e.resource_id IN (SELECT id::text FROM _kiikis_retired_novel_works);

  DELETE FROM public.storyflow_generation_tasks AS t
  WHERE t.id IN (SELECT id FROM _kiikis_retired_novel_generation_tasks);

  DELETE FROM public.storyflow_generation_jobs AS j
  WHERE j.id IN (SELECT id FROM _kiikis_retired_novel_generation_jobs);

  DELETE FROM public.storyflow_evidence_events AS e
  WHERE e.case_id IN (SELECT id FROM _kiikis_retired_novel_evidence_cases)
     OR e.project_id IN (SELECT id FROM _kiikis_retired_novel_projects)
     OR e.work_id IN (SELECT id FROM _kiikis_retired_novel_works);

  DELETE FROM public.storyflow_evidence_documents AS d
  WHERE d.case_id IN (SELECT id FROM _kiikis_retired_novel_evidence_cases);

  DELETE FROM public.storyflow_evidence_packages AS p
  WHERE p.case_id IN (SELECT id FROM _kiikis_retired_novel_evidence_cases)
     OR p.project_id IN (SELECT id FROM _kiikis_retired_novel_projects);

  DELETE FROM public.storyflow_evidence_cases AS c
  WHERE c.id IN (SELECT id FROM _kiikis_retired_novel_evidence_cases);

  DELETE FROM public.storyflow_evidence_packages_v22 AS p
  WHERE p.project_id::text IN (SELECT id FROM _kiikis_retired_novel_projects)
     OR p.work_id IN (SELECT id FROM _kiikis_retired_novel_works);

  DELETE FROM public.storyflow_export_archives
  WHERE project_id IN (SELECT id FROM _kiikis_retired_novel_projects);

  DELETE FROM public.storyflow_exports
  WHERE project_id IN (SELECT id FROM _kiikis_retired_novel_projects);

  DELETE FROM public.storyflow_v2_evidence_events AS e
  WHERE e.project_id IN (SELECT id FROM _kiikis_retired_novel_projects);

  -- This table has no project foreign key; document_type is its explicit
  -- ownership marker, so only novel document versions are removed.
  DELETE FROM public.storyflow_creative_document_versions
  WHERE document_type = 'novel';

  -- Project/work children with ON DELETE CASCADE are removed with these two
  -- parent deletes. SET NULL references (for example unrelated art projects)
  -- remain intact and are intentionally not deleted.
  DELETE FROM public.storyflow_works AS w
  WHERE w.id IN (SELECT id FROM _kiikis_retired_novel_works);

  DELETE FROM public.storyflow_projects AS p
  WHERE p.id IN (SELECT id FROM _kiikis_retired_novel_projects);

  -- Remove retired model-prompt configuration, including its version history.
  DELETE FROM public.storyflow_ai_prompt_overrides
  WHERE target LIKE 'novel\_%' ESCAPE '\';

  DELETE FROM public.storyflow_ai_prompts
  WHERE key LIKE 'novel\_%' ESCAPE '\';

  ALTER TABLE public.storyflow_projects
    DROP CONSTRAINT IF EXISTS storyflow_projects_no_novel_workflow_check;
  ALTER TABLE public.storyflow_projects
    ADD CONSTRAINT storyflow_projects_no_novel_workflow_check CHECK (
      coalesce(workflow_type, '') <> 'novel'
      AND coalesce(mode, '') <> 'novel'
      AND coalesce(data ->> 'workflowType', '') <> 'novel'
      AND coalesce(data ->> 'contentType', '') <> 'novel'
      AND coalesce(data ->> 'workType', '') <> 'novel'
      AND coalesce(data ->> 'workflow_type', '') <> 'novel'
      AND coalesce(data ->> 'content_type', '') <> 'novel'
      AND coalesce(data ->> 'work_type', '') <> 'novel'
    );

  ALTER TABLE public.storyflow_creative_document_versions
    DROP CONSTRAINT IF EXISTS storyflow_creative_document_versions_document_type_check;
  ALTER TABLE public.storyflow_creative_document_versions
    ALTER COLUMN document_type SET DEFAULT 'script';
  ALTER TABLE public.storyflow_creative_document_versions
    ADD CONSTRAINT storyflow_creative_document_versions_document_type_check CHECK (
      document_type IN ('worldbuilding', 'character_bible', 'outline', 'script', 'localization', 'director_notes')
    );

  IF EXISTS (
    SELECT 1 FROM public.storyflow_projects AS p
    WHERE p.workflow_type = 'novel'
       OR p.mode = 'novel'
       OR p.data ->> 'workflowType' = 'novel'
       OR p.data ->> 'contentType' = 'novel'
       OR p.data ->> 'workType' = 'novel'
       OR p.data ->> 'workflow_type' = 'novel'
       OR p.data ->> 'content_type' = 'novel'
       OR p.data ->> 'work_type' = 'novel'
  ) THEN
    RAISE EXCEPTION 'K22 novel retirement left a marked project behind';
  END IF;

  IF EXISTS (SELECT 1 FROM public.storyflow_works WHERE work_type = 'novel') THEN
    RAISE EXCEPTION 'K22 novel retirement left a novel Work behind';
  END IF;

  IF EXISTS (SELECT 1 FROM public.storyflow_creative_document_versions WHERE document_type = 'novel') THEN
    RAISE EXCEPTION 'K22 novel retirement left a novel document version behind';
  END IF;

  IF EXISTS (SELECT 1 FROM public.storyflow_ai_prompts WHERE key LIKE 'novel\_%' ESCAPE '\')
     OR EXISTS (SELECT 1 FROM public.storyflow_ai_prompt_overrides WHERE target LIKE 'novel\_%' ESCAPE '\')
  THEN
    RAISE EXCEPTION 'K22 novel retirement left a novel prompt configuration behind';
  END IF;

  IF (SELECT count(*) FROM public.storyflow_projects) <> preserved_projects THEN
    RAISE EXCEPTION 'K22 novel retirement changed a non-novel project count';
  END IF;

  IF (SELECT count(*) FROM public.storyflow_works) <> preserved_works THEN
    RAISE EXCEPTION 'K22 novel retirement changed a non-novel Work count';
  END IF;

  IF (SELECT count(*) FROM public.storyflow_universes) <> preserved_universes THEN
    RAISE EXCEPTION 'K22 novel retirement changed the Universe count';
  END IF;

  IF (SELECT count(*) FROM public.storyflow_assets) <> preserved_assets THEN
    RAISE EXCEPTION 'K22 novel retirement changed the asset count';
  END IF;
END;
$$;
