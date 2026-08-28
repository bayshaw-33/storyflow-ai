-- Add an explicit, reversible archive state for legacy generation tasks.
-- Archived rows remain addressable for history/detail but are not part of the
-- default task feed. This is not the same as cancelled or completed.
BEGIN;

ALTER TABLE public.storyflow_generation_tasks
  DROP CONSTRAINT IF EXISTS storyflow_generation_tasks_status_check;
ALTER TABLE public.storyflow_generation_tasks
  ADD CONSTRAINT storyflow_generation_tasks_status_check CHECK (
    status = ANY (ARRAY[
      'queued'::text, 'running'::text, 'streaming'::text,
      'completed'::text, 'failed'::text, 'retrying'::text,
      'cancelled'::text, 'archived'::text
    ])
  );

COMMENT ON CONSTRAINT storyflow_generation_tasks_status_check
  ON public.storyflow_generation_tasks IS
  'Archived is a reversible history-only state; it is excluded from the default task feed.';
NOTIFY pgrst, 'reload schema';
COMMIT;
