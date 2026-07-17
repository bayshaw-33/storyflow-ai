-- Evidence Ledger: server-only, append-only production provenance.
-- Rollback (manual, after verifying no active package depends on these rows):
-- DROP TABLE IF EXISTS public.storyflow_evidence_packages;
-- DROP TABLE IF EXISTS public.storyflow_evidence_documents;
-- DROP TABLE IF EXISTS public.storyflow_evidence_events;
-- DROP TABLE IF EXISTS public.storyflow_evidence_cases;
-- DROP FUNCTION IF EXISTS public.append_evidence_event(uuid, text, text, text, text, text, text, jsonb, text, text);
-- DELETE FROM storage.buckets WHERE id = 'evidence-artifacts';

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('evidence-artifacts', 'evidence-artifacts', false, 1073741824)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.storyflow_evidence_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id text NOT NULL,
  source_unit_id text NOT NULL CHECK (length(trim(source_unit_id)) > 0),
  next_sequence_number integer NOT NULL DEFAULT 1 CHECK (next_sequence_number > 0),
  last_event_hash text CHECK (last_event_hash IS NULL OR last_event_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, project_id, source_unit_id)
);

CREATE TABLE IF NOT EXISTS public.storyflow_evidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.storyflow_evidence_cases(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id text NOT NULL,
  source_unit_id text NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  event_type text NOT NULL CHECK (event_type IN (
    'storyboard_snapshot_saved', 'generation_completed', 'reference_selected', 'export_released', 'package_generated'
  )),
  subject_type text NOT NULL CHECK (length(trim(subject_type)) > 0),
  subject_id text NOT NULL CHECK (length(trim(subject_id)) > 0),
  subject_version_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  object_sha256 text CHECK (object_sha256 IS NULL OR object_sha256 ~ '^[0-9a-f]{64}$'),
  previous_event_hash text CHECK (previous_event_hash IS NULL OR previous_event_hash ~ '^[0-9a-f]{64}$'),
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, sequence_number),
  UNIQUE (case_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_evidence_cases_scope
  ON public.storyflow_evidence_cases (owner_id, project_id, source_unit_id);
CREATE INDEX IF NOT EXISTS idx_evidence_events_case_sequence
  ON public.storyflow_evidence_events (case_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_evidence_events_scope
  ON public.storyflow_evidence_events (owner_id, project_id, source_unit_id);

CREATE TABLE IF NOT EXISTS public.storyflow_evidence_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.storyflow_evidence_cases(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('rights_declaration', 'authorization', 'assignment', 'registration_receipt')),
  file_name text NOT NULL CHECK (length(trim(file_name)) > 0),
  storage_bucket text NOT NULL DEFAULT 'evidence-artifacts',
  storage_path text NOT NULL CHECK (length(trim(storage_path)) > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, sha256)
);

CREATE TABLE IF NOT EXISTS public.storyflow_evidence_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.storyflow_evidence_cases(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id text NOT NULL,
  source_unit_id text NOT NULL,
  highest_sequence_number integer NOT NULL CHECK (highest_sequence_number >= 0),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  package_sha256 text NOT NULL CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text NOT NULL DEFAULT 'evidence-artifacts',
  storage_path text NOT NULL CHECK (length(trim(storage_path)) > 0),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, package_sha256)
);

CREATE INDEX IF NOT EXISTS idx_evidence_documents_case ON public.storyflow_evidence_documents (case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packages_scope ON public.storyflow_evidence_packages (owner_id, project_id, source_unit_id);

CREATE OR REPLACE FUNCTION public.evidence_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'EVIDENCE_EVENT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS evidence_events_immutable ON public.storyflow_evidence_events;
CREATE TRIGGER evidence_events_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_evidence_events
  FOR EACH ROW EXECUTE FUNCTION public.evidence_events_immutable();

CREATE OR REPLACE FUNCTION public.append_evidence_event(
  p_owner_id uuid,
  p_project_id text,
  p_source_unit_id text,
  p_event_type text,
  p_subject_type text,
  p_subject_id text,
  p_subject_version_id text,
  p_payload jsonb,
  p_object_sha256 text,
  p_idempotency_key text
)
RETURNS public.storyflow_evidence_events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.storyflow_evidence_cases;
  v_existing public.storyflow_evidence_events;
  v_event public.storyflow_evidence_events;
  v_occurred_at timestamptz := now();
  v_event_hash text;
BEGIN
  IF p_project_id = '' OR p_source_unit_id = '' OR p_subject_type = '' OR p_subject_id = '' OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'EVIDENCE_INVALID_SCOPE_OR_SUBJECT';
  END IF;
  IF p_event_type NOT IN ('storyboard_snapshot_saved', 'generation_completed', 'reference_selected', 'export_released', 'package_generated') THEN
    RAISE EXCEPTION 'EVIDENCE_INVALID_EVENT_TYPE';
  END IF;
  IF p_object_sha256 IS NOT NULL AND p_object_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'EVIDENCE_INVALID_OBJECT_HASH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.storyflow_projects
    WHERE id::text = p_project_id
      AND COALESCE(owner_id, user_id) = p_owner_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'EVIDENCE_PROJECT_NOT_FOUND';
  END IF;

  INSERT INTO public.storyflow_evidence_cases (owner_id, project_id, source_unit_id)
  VALUES (p_owner_id, p_project_id, p_source_unit_id)
  ON CONFLICT (owner_id, project_id, source_unit_id) DO NOTHING;

  SELECT * INTO v_case
  FROM public.storyflow_evidence_cases
  WHERE owner_id = p_owner_id AND project_id = p_project_id AND source_unit_id = p_source_unit_id
  FOR UPDATE;

  SELECT * INTO v_existing
  FROM public.storyflow_evidence_events
  WHERE case_id = v_case.id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_event_hash := encode(digest(convert_to(concat_ws('|',
    COALESCE(v_case.last_event_hash, ''),
    v_case.next_sequence_number::text,
    p_event_type,
    p_subject_type,
    p_subject_id,
    COALESCE(p_subject_version_id, ''),
    COALESCE(p_payload, '{}'::jsonb)::text,
    COALESCE(p_object_sha256, ''),
    v_occurred_at::text
  ), 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.storyflow_evidence_events (
    case_id, owner_id, project_id, source_unit_id, sequence_number, event_type,
    subject_type, subject_id, subject_version_id, payload, object_sha256,
    previous_event_hash, event_hash, idempotency_key, occurred_at
  ) VALUES (
    v_case.id, p_owner_id, p_project_id, p_source_unit_id, v_case.next_sequence_number, p_event_type,
    p_subject_type, p_subject_id, NULLIF(p_subject_version_id, ''), COALESCE(p_payload, '{}'::jsonb), p_object_sha256,
    v_case.last_event_hash, v_event_hash, p_idempotency_key, v_occurred_at
  ) RETURNING * INTO v_event;

  UPDATE public.storyflow_evidence_cases
  SET next_sequence_number = v_case.next_sequence_number + 1,
      last_event_hash = v_event_hash,
      updated_at = v_occurred_at
  WHERE id = v_case.id;

  RETURN v_event;
END;
$$;

ALTER TABLE public.storyflow_evidence_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_evidence_packages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.storyflow_evidence_cases FROM anon, authenticated;
REVOKE ALL ON public.storyflow_evidence_events FROM anon, authenticated;
REVOKE ALL ON public.storyflow_evidence_documents FROM anon, authenticated;
REVOKE ALL ON public.storyflow_evidence_packages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storyflow_evidence_events FROM authenticated;
GRANT SELECT ON public.storyflow_evidence_cases TO authenticated;
GRANT SELECT ON public.storyflow_evidence_events TO authenticated;
GRANT SELECT ON public.storyflow_evidence_documents TO authenticated;
GRANT SELECT ON public.storyflow_evidence_packages TO authenticated;
GRANT ALL ON public.storyflow_evidence_cases TO service_role;
GRANT ALL ON public.storyflow_evidence_events TO service_role;
GRANT ALL ON public.storyflow_evidence_documents TO service_role;
GRANT ALL ON public.storyflow_evidence_packages TO service_role;

CREATE POLICY evidence_cases_owner_select ON public.storyflow_evidence_cases
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY evidence_events_owner_select ON public.storyflow_evidence_events
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY evidence_documents_owner_select ON public.storyflow_evidence_documents
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY evidence_packages_owner_select ON public.storyflow_evidence_packages
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

REVOKE ALL ON FUNCTION public.append_evidence_event(uuid, text, text, text, text, text, text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_evidence_event(uuid, text, text, text, text, text, text, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.append_evidence_event(uuid, text, text, text, text, text, text, jsonb, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_evidence_event(uuid, text, text, text, text, text, text, jsonb, text, text) TO service_role;
