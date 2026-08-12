-- K2-C-04: Universe change proposals, proposal items, and atomic review events.

CREATE TABLE IF NOT EXISTS public.storyflow_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id UUID NOT NULL REFERENCES public.storyflow_universes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_project_id TEXT NOT NULL REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  source_step TEXT NOT NULL CHECK (length(trim(source_step)) > 0),
  source_text TEXT NOT NULL DEFAULT '',
  source_asset_id UUID REFERENCES public.storyflow_assets(id) ON DELETE SET NULL,
  source_reference JSONB,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  field_diffs JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_action TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('draft', 'pending_review', 'accepted', 'edited_and_accepted', 'rejected', 'deferred')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (universe_id, user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.storyflow_change_proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.storyflow_change_proposals(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK (length(trim(object_type)) > 0),
  object_id TEXT,
  current_payload JSONB,
  proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_diffs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_k2_c04_proposals_universe_status
  ON public.storyflow_change_proposals(universe_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_k2_c04_proposal_items_proposal
  ON public.storyflow_change_proposal_items(proposal_id);

ALTER TABLE public.storyflow_change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_change_proposal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k2_c04_proposals_owner_select ON public.storyflow_change_proposals;
CREATE POLICY k2_c04_proposals_owner_select ON public.storyflow_change_proposals FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS k2_c04_proposal_items_owner_select ON public.storyflow_change_proposal_items;
CREATE POLICY k2_c04_proposal_items_owner_select ON public.storyflow_change_proposal_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.storyflow_change_proposals p WHERE p.id = proposal_id AND p.user_id = (select auth.uid())));
GRANT ALL ON public.storyflow_change_proposals TO service_role;
GRANT ALL ON public.storyflow_change_proposal_items TO service_role;

CREATE OR REPLACE FUNCTION public.k2_c04_proposal_insert_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.append_evidence_event(
    NEW.user_id, NEW.source_project_id, 'change-proposal:' || NEW.id::text,
    'generation_completed', 'change_proposal', NEW.id::text, NULL,
    jsonb_build_object('action', 'created', 'proposalId', NEW.id, 'universeId', NEW.universe_id), NULL,
    'change-proposal:' || NEW.id::text || ':created'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS k2_c04_proposal_insert_event ON public.storyflow_change_proposals;
CREATE TRIGGER k2_c04_proposal_insert_event
  AFTER INSERT ON public.storyflow_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.k2_c04_proposal_insert_event();

CREATE OR REPLACE FUNCTION public.create_change_proposal(
  p_user_id UUID,
  p_universe_id UUID,
  p_source_project_id TEXT,
  p_source_step TEXT,
  p_source_text TEXT,
  p_source_asset_id UUID,
  p_source_reference JSONB,
  p_confidence NUMERIC,
  p_field_diffs JSONB,
  p_suggested_action TEXT,
  p_idempotency_key TEXT,
  p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_proposal public.storyflow_change_proposals;
  v_item JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'CHANGE_PROPOSAL_CALLER_MISMATCH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.storyflow_projects p
    WHERE p.id = p_source_project_id
      AND COALESCE(p.owner_id, p.user_id) = p_user_id
      AND p.deleted_at IS NULL
      AND (p.universe_id = p_universe_id OR EXISTS (
        SELECT 1 FROM public.storyflow_universe_project_links l
        WHERE l.project_id = p.id AND l.universe_id = p_universe_id AND l.unbound_at IS NULL
      ))
  ) THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_SOURCE_PROJECT_INVALID'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.storyflow_project_steps s
    WHERE s.project_id = p_source_project_id AND s.step_key = p_source_step AND s.user_id = p_user_id
  ) THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_SOURCE_STEP_INVALID'; END IF;
  IF p_source_asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.storyflow_assets a
    WHERE a.id = p_source_asset_id AND (a.user_id = p_user_id OR a.project_id = p_source_project_id)
  ) THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_SOURCE_ASSET_INVALID'; END IF;

  SELECT * INTO v_proposal FROM public.storyflow_change_proposals
    WHERE universe_id = p_universe_id AND user_id = p_user_id AND idempotency_key = p_idempotency_key
    FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('created', false, 'proposal', to_jsonb(v_proposal)); END IF;

  INSERT INTO public.storyflow_change_proposals (
    universe_id, user_id, source_project_id, source_step, source_text, source_asset_id,
    source_reference, confidence, field_diffs, suggested_action, idempotency_key, status
  ) VALUES (
    p_universe_id, p_user_id, p_source_project_id, p_source_step, COALESCE(p_source_text, ''), p_source_asset_id,
    p_source_reference, p_confidence, COALESCE(p_field_diffs, '[]'::jsonb), COALESCE(p_suggested_action, ''), p_idempotency_key, 'pending_review'
  ) RETURNING * INTO v_proposal;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO public.storyflow_change_proposal_items (
      proposal_id, item_key, object_type, object_id, current_payload, proposed_payload, field_diffs
    ) VALUES (
      v_proposal.id,
      COALESCE(v_item->>'itemKey', v_item->>'objectType' || ':' || COALESCE(v_item->>'objectId', 'new')),
      v_item->>'objectType', NULLIF(v_item->>'objectId', ''), v_item->'currentPayload', COALESCE(v_item->'proposedPayload', '{}'::jsonb), COALESCE(v_item->'fieldDiffs', '[]'::jsonb)
    );
  END LOOP;
  RETURN jsonb_build_object('created', true, 'proposal', to_jsonb(v_proposal));
END;
$$;

CREATE OR REPLACE FUNCTION public.record_change_proposal_event(
  p_user_id UUID,
  p_universe_id UUID,
  p_proposal_id UUID,
  p_action TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_proposal public.storyflow_change_proposals;
  v_project_id TEXT;
  v_source_unit_id TEXT;
  v_idempotency TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'CHANGE_PROPOSAL_CALLER_MISMATCH';
  END IF;
  SELECT * INTO v_proposal FROM public.storyflow_change_proposals
    WHERE id = p_proposal_id AND universe_id = p_universe_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_NOT_FOUND'; END IF;
  v_project_id := v_proposal.source_project_id;
  v_source_unit_id := 'change-proposal:' || v_proposal.id::text;
  v_idempotency := 'change-proposal:' || v_proposal.id::text || ':' || p_action;
  RETURN to_jsonb(public.append_evidence_event(
    p_user_id, v_project_id, v_source_unit_id, 'generation_completed', 'change_proposal', v_proposal.id::text,
    NULL, jsonb_build_object('action', p_action, 'proposalId', v_proposal.id, 'universeId', p_universe_id), NULL, v_idempotency
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_change_proposal(
  p_user_id UUID,
  p_universe_id UUID,
  p_proposal_id UUID,
  p_action TEXT,
  p_edited_payload JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_proposal public.storyflow_change_proposals;
  v_item public.storyflow_change_proposal_items;
  v_status TEXT;
  v_version_id UUID;
  v_affected JSONB := '[]'::jsonb;
  v_snapshot JSONB := '[]'::jsonb;
  v_version_no INTEGER;
  v_payload JSONB;
  v_event JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'CHANGE_PROPOSAL_CALLER_MISMATCH';
  END IF;
  IF p_action NOT IN ('accept', 'edit_accept', 'reject', 'defer') THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_INVALID_ACTION'; END IF;
  SELECT * INTO v_proposal FROM public.storyflow_change_proposals
    WHERE id = p_proposal_id AND universe_id = p_universe_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.storyflow_projects p
    WHERE p.id = v_proposal.source_project_id
      AND COALESCE(p.owner_id, p.user_id) = p_user_id
      AND p.deleted_at IS NULL
      AND (p.universe_id = p_universe_id OR EXISTS (
        SELECT 1 FROM public.storyflow_universe_project_links l
        WHERE l.project_id = p.id AND l.universe_id = p_universe_id AND l.unbound_at IS NULL
      ))
  ) THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_SOURCE_PROJECT_INVALID'; END IF;
  IF v_proposal.status NOT IN ('draft', 'pending_review', 'deferred') THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_ALREADY_REVIEWED'; END IF;

  v_status := CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'edit_accept' THEN 'edited_and_accepted' WHEN 'reject' THEN 'rejected' ELSE 'deferred' END;
  IF p_action IN ('accept', 'edit_accept') THEN
    FOR v_item IN SELECT * FROM public.storyflow_change_proposal_items WHERE proposal_id = v_proposal.id ORDER BY id FOR UPDATE LOOP
      v_payload := CASE WHEN p_action = 'edit_accept' AND p_edited_payload IS NOT NULL THEN COALESCE(p_edited_payload -> COALESCE(v_item.object_id, v_item.item_key), v_item.proposed_payload) ELSE v_item.proposed_payload END;
      IF v_item.object_type IN ('entity', 'character', 'location', 'organization', 'object', 'rule', 'concept') THEN
        IF v_item.object_id IS NULL THEN
          INSERT INTO public.storyflow_universe_entities (universe_id, user_id, type, name, summary, details_json, status, source_project_id, source_step_id)
          VALUES (p_universe_id, p_user_id, COALESCE(v_payload->>'type', CASE WHEN v_item.object_type = 'entity' THEN 'concept' ELSE v_item.object_type END), COALESCE(v_payload->>'name', ''), COALESCE(v_payload->>'summary', ''), COALESCE(v_payload->'details', '{}'::jsonb), 'canon', v_proposal.source_project_id, v_proposal.source_step)
          RETURNING id INTO v_item.object_id;
        ELSE
          UPDATE public.storyflow_universe_entities SET
            name = COALESCE(v_payload->>'name', name), summary = COALESCE(v_payload->>'summary', summary), details_json = COALESCE(v_payload->'details', details_json), status = COALESCE(v_payload->>'status', status), updated_at = now()
          WHERE id::text = v_item.object_id AND universe_id = p_universe_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_TARGET_NOT_FOUND'; END IF;
        END IF;
      ELSIF v_item.object_type IN ('canon_fact', 'fact') THEN
        IF v_item.object_id IS NULL THEN
          INSERT INTO public.storyflow_canon_facts (universe_id, user_id, fact_text, category, importance, status, is_locked, source_project_id, source_episode, confirmed_by_user, confirmed_at)
          VALUES (p_universe_id, p_user_id, COALESCE(v_payload->>'factText', v_payload->>'fact_text', ''), COALESCE(v_payload->>'category', 'character'), COALESCE(v_payload->>'importance', 'medium'), 'canon', true, v_proposal.source_project_id, v_proposal.source_step, true, now())
          RETURNING id INTO v_item.object_id;
        ELSE
          UPDATE public.storyflow_canon_facts SET fact_text = COALESCE(v_payload->>'factText', v_payload->>'fact_text', fact_text), category = COALESCE(v_payload->>'category', category), importance = COALESCE(v_payload->>'importance', importance), updated_at = now()
          WHERE id::text = v_item.object_id AND universe_id = p_universe_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_TARGET_NOT_FOUND'; END IF;
        END IF;
      ELSIF v_item.object_type IN ('relationship', 'timeline_event') THEN
        IF v_item.object_type = 'relationship' THEN
          IF v_item.object_id IS NULL THEN INSERT INTO public.storyflow_universe_relationships (universe_id, user_id, relationship_type, summary, status, source_project_id) VALUES (p_universe_id, p_user_id, COALESCE(v_payload->>'relationshipType', 'related'), COALESCE(v_payload->>'summary', ''), 'canon', v_proposal.source_project_id) RETURNING id INTO v_item.object_id;
          ELSE UPDATE public.storyflow_universe_relationships SET relationship_type = COALESCE(v_payload->>'relationshipType', relationship_type), summary = COALESCE(v_payload->>'summary', summary), updated_at = now() WHERE id::text = v_item.object_id AND universe_id = p_universe_id; IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_TARGET_NOT_FOUND'; END IF; END IF;
        ELSE
          IF v_item.object_id IS NULL THEN INSERT INTO public.storyflow_universe_timeline_events (universe_id, user_id, title, description, date_label, status, source_project_id) VALUES (p_universe_id, p_user_id, COALESCE(v_payload->>'title', ''), COALESCE(v_payload->>'description', ''), COALESCE(v_payload->>'dateLabel', ''), 'canon', v_proposal.source_project_id) RETURNING id INTO v_item.object_id;
          ELSE UPDATE public.storyflow_universe_timeline_events SET title = COALESCE(v_payload->>'title', title), description = COALESCE(v_payload->>'description', description), date_label = COALESCE(v_payload->>'dateLabel', date_label), updated_at = now() WHERE id::text = v_item.object_id AND universe_id = p_universe_id; IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_TARGET_NOT_FOUND'; END IF; END IF;
        END IF;
      ELSE RAISE EXCEPTION 'CHANGE_PROPOSAL_UNSUPPORTED_OBJECT_TYPE';
      END IF;
      v_affected := v_affected || jsonb_build_array(jsonb_build_object('objectType', v_item.object_type, 'count', 1));
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('objectType', v_item.object_type, 'objectId', v_item.object_id, 'payload', v_payload));
    END LOOP;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_universe_id::text, 0));
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_version_no
      FROM public.storyflow_versions
      WHERE entity_type = 'universe' AND entity_id = p_universe_id::text;
    INSERT INTO public.storyflow_versions (user_id, project_id, step_key, version_type, content_snapshot, diff_snapshot, entity_type, entity_id, version_no, source, snapshot_json, diff_json, created_by)
    VALUES (p_user_id, v_proposal.source_project_id, v_proposal.source_step, 'canon_change', jsonb_build_object('proposalId', v_proposal.id, 'universeId', p_universe_id, 'objects', v_snapshot), v_proposal.field_diffs, 'universe', p_universe_id::text, v_version_no, 'manual', jsonb_build_object('proposalId', v_proposal.id, 'universeId', p_universe_id, 'objects', v_snapshot), v_proposal.field_diffs, p_user_id)
    RETURNING id INTO v_version_id;
  END IF;
  UPDATE public.storyflow_change_proposals SET status = v_status, reviewed_by = p_user_id, reviewed_at = now(), updated_at = now() WHERE id = v_proposal.id;
  v_event := public.record_change_proposal_event(p_user_id, p_universe_id, v_proposal.id, p_action);
  RETURN jsonb_build_object('proposalId', v_proposal.id, 'status', v_status, 'versionId', v_version_id, 'affected', v_affected, 'evidenceEventId', v_event->>'id');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_change_proposal_batch(
  p_user_id UUID,
  p_universe_id UUID,
  p_proposal_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_proposal_id UUID;
  v_items JSONB := '[]'::jsonb;
BEGIN
  IF COALESCE(array_length(p_proposal_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'CHANGE_PROPOSAL_EMPTY_BATCH'; END IF;
  FOREACH v_proposal_id IN ARRAY p_proposal_ids LOOP
    v_items := v_items || jsonb_build_array(public.apply_change_proposal(p_user_id, p_universe_id, v_proposal_id, 'accept', NULL));
  END LOOP;
  RETURN jsonb_build_object('items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.create_change_proposal(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, NUMERIC, JSONB, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_change_proposal_event(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_change_proposal(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_change_proposal_batch(UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_change_proposal(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, NUMERIC, JSONB, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_change_proposal_event(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_change_proposal(UUID, UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_change_proposal_batch(UUID, UUID, UUID[]) TO service_role;

COMMENT ON TABLE public.storyflow_change_proposals IS 'K2-C-04 review inbox. Proposal rows are not Canon until an atomic review RPC accepts them.';
COMMENT ON TABLE public.storyflow_change_proposal_items IS 'K2-C-04 object-level diffs attached to a change proposal.';
