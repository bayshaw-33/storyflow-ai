-- Legacy-compatible production-workbench snapshot. The structured production
-- tables remain authoritative; this column stores the compatibility payload
-- used by existing creation and production routes.
ALTER TABLE public.storyflow_projects
  ADD COLUMN IF NOT EXISTS delivery_package text;
