-- Evidence Ledger hardening: fixed search_path for the append-only trigger.
CREATE OR REPLACE FUNCTION public.evidence_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'EVIDENCE_EVENT_IMMUTABLE';
END;
$$;
