-- K22: convert retired-novel projects into script projects (2026-08-16).
--
-- Owner decision: do NOT delete the 45 novel projects (retire_novel_*
-- migrations stay unapplied). Instead every novel project becomes a script
-- project that still opens in the Screenplay Studio:
--   1) novel markers -> script (workflow_type, mode, data.workflowType)
--   2) one primary 'script' Work per project (idempotent via the P0
--      project_starts ledger) so /resolve-work can enter the studio
--   3) one seeded outline unit carrying the structured brief the user
--      filled (logline / genre / market / language style / pacing rules)
--   4) afterwards: add the no-novel CHECK so the marker cannot come back
--
-- Nothing is deleted or overwritten beyond the type markers: story_bible,
-- generations (425 rows of AI history), assets and every other field stay
-- exactly as they are. Forward-only, idempotent (re-running is a no-op).

CREATE TEMP TABLE _novel_conversion_targets (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  brief jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _novel_conversion_targets
SELECT p.id, p.owner_id, p.title,
  jsonb_build_object(
    'logline',        coalesce(p.story_bible ->> 'logline', ''),
    'genreType',      coalesce(p.story_bible ->> 'genreType', ''),
    'targetMarket',   coalesce(p.story_bible ->> 'targetMarket', ''),
    'languageStyle',  coalesce(p.story_bible ->> 'languageStyle', ''),
    'pacingRules',    coalesce(p.story_bible ->> 'pacingRules', '')
  )
FROM public.storyflow_projects AS p
WHERE p.workflow_type = 'novel'
   OR p.mode = 'novel'
   OR p.data ->> 'workflowType' = 'novel'
   OR p.data ->> 'contentType' = 'novel'
   OR p.data ->> 'workType' = 'novel'
   OR p.data ->> 'workflow_type' = 'novel'
   OR p.data ->> 'content_type' = 'novel'
   OR p.data ->> 'work_type' = 'novel';

-- 1) markers -----------------------------------------------------------------
UPDATE public.storyflow_projects AS p SET
  workflow_type = 'script',
  mode = NULL,
  data = p.data || jsonb_build_object('workflowType', 'script'),
  updated_at = now()
FROM _novel_conversion_targets AS t
WHERE p.id = t.id;

-- 2) primary Work per project (idempotent) -----------------------------------
INSERT INTO public.storyflow_works (
  owner_id, project_id, work_type, title, status, is_primary, idempotency_key
)
SELECT
  t.owner_id, t.id, 'script', t.title, 'editing_draft', true,
  'novel-to-script-' || t.id
FROM _novel_conversion_targets AS t
ON CONFLICT DO NOTHING;

-- P0 idempotency ledger (matches create_project_with_primary_work shape).
INSERT INTO public.storyflow_project_starts (
  owner_id, idempotency_key, project_id, work_id, work_type
)
SELECT
  w.owner_id, w.idempotency_key, w.project_id, w.id, 'script'
FROM public.storyflow_works AS w
JOIN _novel_conversion_targets AS t ON t.id = w.project_id
ON CONFLICT DO NOTHING;

-- 3) seeded outline unit with the structured brief ----------------------------
-- Unit identity (idempotent via the (work_id, legacy_id) unique constraint).
INSERT INTO public.storyflow_screenplay_units (
  work_id, type, order_index, title, readiness, legacy_id, created_by
)
SELECT
  w.id, 'outline', 1, '剧情及大纲（自小说项目转入）', 'empty', 'novel-converted-outline', w.owner_id
FROM public.storyflow_works AS w
JOIN _novel_conversion_targets AS t ON t.id = w.project_id
ON CONFLICT DO NOTHING;

-- Unit content: only the sections the user actually filled.
WITH seeded AS (
  SELECT
    u.id AS unit_id,
    u.work_id,
    u.created_by,
    rtrim(concat_ws(E'\n',
      CASE WHEN t.brief ->> 'logline' <> '' THEN '一句话故事（logline）：' || (t.brief ->> 'logline') END,
      CASE WHEN t.brief ->> 'genreType' <> '' THEN '题材：' || (t.brief ->> 'genreType') END,
      CASE WHEN t.brief ->> 'targetMarket' <> '' THEN '目标市场：' || (t.brief ->> 'targetMarket') END,
      CASE WHEN t.brief ->> 'languageStyle' <> '' THEN '语言风格：' || (t.brief ->> 'languageStyle') END,
      CASE WHEN t.brief ->> 'pacingRules' <> '' THEN '节奏规则：' || (t.brief ->> 'pacingRules') END
    ), E'\n') || E'\n\n说明：本项目由旧小说工作台转入剧本模式；原有设定与生成历史完整保留，可在此继续创作。' AS body
  FROM public.storyflow_screenplay_units AS u
  JOIN public.storyflow_works AS w ON w.id = u.work_id
  JOIN _novel_conversion_targets AS t ON t.id = w.project_id
  WHERE u.legacy_id = 'novel-converted-outline'
)
INSERT INTO public.storyflow_screenplay_unit_versions (
  work_id, unit_id, content_schema, content_json, content_hash,
  source, source_message_ids, idempotency_key, created_by
)
SELECT
  s.work_id, s.unit_id, 'kiikis.screenplay-unit/1',
  jsonb_build_object('body', s.body),
  encode(sha256(convert_to(s.body, 'utf8')), 'hex'),
  'import', '{}'::text[], 'novel-converted-outline-' || s.unit_id::text, s.created_by
FROM seeded AS s
ON CONFLICT DO NOTHING;

-- Point the unit at its seeded version.
UPDATE public.storyflow_screenplay_units AS u SET
  current_version_id = v.id,
  readiness = 'draft',
  updated_at = now()
FROM public.storyflow_screenplay_unit_versions AS v
WHERE v.idempotency_key = 'novel-converted-outline-' || u.id::text
  AND u.legacy_id = 'novel-converted-outline'
  AND u.current_version_id IS NULL;

-- 4) assertions + no-novel guard ----------------------------------------------
DO $$
DECLARE
  v_targets int;
  v_works int;
  v_units int;
  v_left int;
BEGIN
  SELECT count(*) INTO v_targets FROM _novel_conversion_targets;
  SELECT count(*) INTO v_works
  FROM public.storyflow_works AS w JOIN _novel_conversion_targets AS t ON t.id = w.project_id
  WHERE w.is_primary AND w.work_type = 'script';
  SELECT count(*) INTO v_units
  FROM public.storyflow_screenplay_units AS u
  JOIN public.storyflow_works AS w ON w.id = u.work_id
  JOIN _novel_conversion_targets AS t ON t.id = w.project_id
  WHERE u.legacy_id = 'novel-converted-outline' AND u.current_version_id IS NOT NULL;

  IF v_works <> v_targets THEN
    RAISE EXCEPTION 'novel->script conversion: works (%) <> targets (%)', v_works, v_targets;
  END IF;
  IF v_units <> v_targets THEN
    RAISE EXCEPTION 'novel->script conversion: seeded units (%) <> targets (%)', v_units, v_targets;
  END IF;

  SELECT count(*) INTO v_left FROM public.storyflow_projects AS p
  WHERE p.workflow_type = 'novel' OR p.mode = 'novel'
     OR p.data ->> 'workflowType' = 'novel' OR p.data ->> 'contentType' = 'novel'
     OR p.data ->> 'workType' = 'novel' OR p.data ->> 'workflow_type' = 'novel'
     OR p.data ->> 'content_type' = 'novel' OR p.data ->> 'work_type' = 'novel';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'novel->script conversion left % novel marker(s) behind', v_left;
  END IF;

  RAISE NOTICE 'NOVEL_TO_SCRIPT_OK: % projects converted', v_targets;
END $$;

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
