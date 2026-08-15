-- K22 follow-up for environments that applied the initial retirement migration
-- before append-only history guards and legacy project-linked tables were
-- accounted for. It is idempotent and still uses only explicit markers.

CREATE TEMP TABLE _kiikis_retired_novel_projects_hardening (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _kiikis_retired_novel_projects_hardening (id)
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

ALTER TABLE public.storyflow_evidence_events DISABLE TRIGGER evidence_events_immutable;
ALTER TABLE public.storyflow_work_versions DISABLE TRIGGER trg_block_delete_work_versions;
ALTER TABLE public.storyflow_conversation_messages DISABLE TRIGGER trg_block_delete_messages;

DELETE FROM public.storyflow_evidence_events
WHERE project_id IN (SELECT id FROM _kiikis_retired_novel_projects_hardening);
DELETE FROM public.storyflow_generations
WHERE project_id IN (SELECT id FROM _kiikis_retired_novel_projects_hardening);
DELETE FROM public.storyflow_versions
WHERE project_id IN (SELECT id FROM _kiikis_retired_novel_projects_hardening);
DELETE FROM public.storyflow_works
WHERE project_id IN (SELECT id FROM _kiikis_retired_novel_projects_hardening);
DELETE FROM public.storyflow_projects
WHERE id IN (SELECT id FROM _kiikis_retired_novel_projects_hardening);

ALTER TABLE public.storyflow_evidence_events ENABLE TRIGGER evidence_events_immutable;
ALTER TABLE public.storyflow_work_versions ENABLE TRIGGER trg_block_delete_work_versions;
ALTER TABLE public.storyflow_conversation_messages ENABLE TRIGGER trg_block_delete_messages;

DO $$
BEGIN
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
    RAISE EXCEPTION 'K22 novel hardening left a marked project behind';
  END IF;
END;
$$;
