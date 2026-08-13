-- K2-C-08: license offers, append-only project copies, and Usage Grant state machine.
CREATE TABLE IF NOT EXISTS public.storyflow_v2_license_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.storyflow_v2_assets(id) ON DELETE RESTRICT,
  asset_version_id UUID NOT NULL REFERENCES public.storyflow_v2_asset_versions(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  template TEXT NOT NULL CHECK (template IN ('platform_free', 'non_commercial', 'single_project', 'team_internal', 'commercial', 'custom')),
  terms JSONB NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storyflow_v2_usage_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.storyflow_v2_license_offers(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.storyflow_v2_assets(id) ON DELETE RESTRICT,
  asset_version_id UUID NOT NULL REFERENCES public.storyflow_v2_asset_versions(id) ON DELETE RESTRICT,
  licensor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  licensee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked_for_new_use', 'cancelled', 'disputed')),
  expires_at TIMESTAMPTZ,
  rights_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storyflow_v2_asset_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.storyflow_v2_usage_grants(id) ON DELETE RESTRICT,
  source_asset_id UUID NOT NULL REFERENCES public.storyflow_v2_assets(id) ON DELETE RESTRICT,
  source_version_id UUID NOT NULL REFERENCES public.storyflow_v2_asset_versions(id) ON DELETE RESTRICT,
  copy_asset_id UUID NOT NULL REFERENCES public.storyflow_v2_assets(id) ON DELETE RESTRICT,
  target_project_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.enforce_usage_grant_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('active', 'revoked_for_new_use', 'cancelled', 'disputed')) OR
    (OLD.status = 'active' AND NEW.status IN ('expired', 'revoked_for_new_use', 'disputed')) OR
    (OLD.status IN ('expired', 'revoked_for_new_use', 'cancelled', 'disputed') AND NEW.status = OLD.status)
  ) THEN
    RAISE EXCEPTION 'invalid usage grant transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storyflow_v2_usage_grant_transition ON public.storyflow_v2_usage_grants;
CREATE TRIGGER storyflow_v2_usage_grant_transition
  BEFORE UPDATE OF status ON public.storyflow_v2_usage_grants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_usage_grant_transition();

CREATE OR REPLACE FUNCTION public.prevent_unconfirmed_portrait_publication()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.actor_id IS NOT NULL AND NEW.rights_state <> 'portrait_confirmed' THEN
    RAISE EXCEPTION 'confirmed portrait rights required before publication';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storyflow_v2_asset_portrait_publication_guard ON public.storyflow_v2_assets;
CREATE TRIGGER storyflow_v2_asset_portrait_publication_guard
  BEFORE INSERT OR UPDATE OF status, actor_id, rights_state ON public.storyflow_v2_assets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unconfirmed_portrait_publication();

CREATE INDEX IF NOT EXISTS storyflow_v2_license_offers_asset_idx ON public.storyflow_v2_license_offers(asset_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS storyflow_v2_usage_grants_participant_idx ON public.storyflow_v2_usage_grants(licensor_id, licensee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS storyflow_v2_asset_copies_grant_idx ON public.storyflow_v2_asset_copies(grant_id, created_at ASC);

ALTER TABLE public.storyflow_v2_license_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_usage_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_asset_copies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storyflow_v2_license_offers_owner_read ON public.storyflow_v2_license_offers;
DROP POLICY IF EXISTS storyflow_v2_usage_grants_participant_read ON public.storyflow_v2_usage_grants;
DROP POLICY IF EXISTS storyflow_v2_asset_copies_participant_read ON public.storyflow_v2_asset_copies;
CREATE POLICY storyflow_v2_license_offers_owner_read ON public.storyflow_v2_license_offers FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY storyflow_v2_usage_grants_participant_read ON public.storyflow_v2_usage_grants FOR SELECT USING (licensor_id = auth.uid() OR licensee_id = auth.uid());
CREATE POLICY storyflow_v2_asset_copies_participant_read ON public.storyflow_v2_asset_copies FOR SELECT USING (EXISTS (SELECT 1 FROM public.storyflow_v2_usage_grants g WHERE g.id = grant_id AND (g.licensor_id = auth.uid() OR g.licensee_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.invoke_usage_grant(p_grant_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.storyflow_v2_usage_grants%ROWTYPE; o public.storyflow_v2_license_offers%ROWTYPE; a public.storyflow_v2_assets%ROWTYPE; v public.storyflow_v2_asset_versions%ROWTYPE; copy_asset public.storyflow_v2_assets%ROWTYPE; copy_version public.storyflow_v2_asset_versions%ROWTYPE; copy_row public.storyflow_v2_asset_copies%ROWTYPE; project_owner UUID; project_user UUID; project_organization UUID;
BEGIN
  SELECT * INTO g FROM public.storyflow_v2_usage_grants WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND OR g.licensee_id <> p_user_id THEN RAISE EXCEPTION 'usage grant not found or caller is not the licensee'; END IF;
  IF g.status NOT IN ('pending', 'active') THEN RAISE EXCEPTION 'usage grant cannot be invoked in current state'; END IF;
  IF g.expires_at IS NOT NULL AND g.expires_at <= now() THEN UPDATE public.storyflow_v2_usage_grants SET status = 'expired', updated_at = now() WHERE id = g.id RETURNING * INTO g; RAISE EXCEPTION 'usage grant has expired'; END IF;
  SELECT owner_id, user_id, organization_id INTO project_owner, project_user, project_organization FROM public.storyflow_projects WHERE id = g.target_project_id AND deleted_at IS NULL;
  IF project_owner IS NULL AND project_user IS NULL THEN RAISE EXCEPTION 'target project not found'; END IF;
  IF project_owner IS DISTINCT FROM p_user_id AND project_user IS DISTINCT FROM p_user_id AND NOT EXISTS (SELECT 1 FROM public.storyflow_organization_members om WHERE om.organization_id = project_organization AND om.user_id = p_user_id) THEN RAISE EXCEPTION 'target project access denied'; END IF;
  SELECT * INTO o FROM public.storyflow_v2_license_offers WHERE id = g.offer_id AND status = 'active';
  SELECT * INTO a FROM public.storyflow_v2_assets WHERE id = g.asset_id;
  SELECT * INTO v FROM public.storyflow_v2_asset_versions WHERE id = g.asset_version_id;
  IF o.id IS NULL OR a.id IS NULL OR v.id IS NULL OR v.storage_path ~* '^https?://' THEN RAISE EXCEPTION 'license source no longer exists or is not durably stored'; END IF;
  IF a.actor_id IS NOT NULL AND a.rights_state <> 'portrait_confirmed' THEN RAISE EXCEPTION 'confirmed portrait rights required'; END IF;
  SELECT * INTO copy_row FROM public.storyflow_v2_asset_copies WHERE grant_id = g.id ORDER BY created_at ASC LIMIT 1;
  IF FOUND THEN SELECT * INTO copy_asset FROM public.storyflow_v2_assets WHERE id = copy_row.copy_asset_id; RETURN jsonb_build_object('grant', to_jsonb(g), 'copy', jsonb_build_object('id', copy_row.id, 'copy_asset_id', copy_asset.id, 'target_project_id', copy_row.target_project_id)); END IF;
  IF g.status = 'pending' THEN UPDATE public.storyflow_v2_usage_grants SET status = 'active', rights_snapshot = jsonb_build_object('assetStatus', a.status, 'rightsState', a.rights_state, 'terms', o.terms), updated_at = now() WHERE id = g.id RETURNING * INTO g; END IF;
  INSERT INTO public.storyflow_v2_assets (owner_id, project_id, kind, name, status, actor_id, rights_state, current_version_id, metadata)
    VALUES (g.licensee_id, g.target_project_id, a.kind, a.name, 'draft', NULL, 'ai_generated', NULL, jsonb_build_object('sourceAssetId', a.id, 'sourceVersionId', v.id, 'grantId', g.id)) RETURNING * INTO copy_asset;
  INSERT INTO public.storyflow_v2_asset_versions (asset_id, source_asset_id, source_project_id, source_step, model_key, change_description, storage_bucket, storage_path, metadata, created_by)
    VALUES (copy_asset.id, a.id, g.target_project_id, 'licensed_copy', NULL, 'Project-level licensed copy; source identity remains immutable.', v.storage_bucket, v.storage_path, jsonb_build_object('grantId', g.id, 'sourceAssetId', a.id, 'sourceVersionId', v.id), g.licensee_id) RETURNING * INTO copy_version;
  UPDATE public.storyflow_v2_assets SET current_version_id = copy_version.id, updated_at = now() WHERE id = copy_asset.id;
  INSERT INTO public.storyflow_v2_asset_copies (grant_id, source_asset_id, source_version_id, copy_asset_id, target_project_id) VALUES (g.id, a.id, v.id, copy_asset.id, g.target_project_id) RETURNING * INTO copy_row;
  INSERT INTO public.storyflow_v2_asset_usages (asset_id, version_id, project_id, usage_kind, created_by) VALUES (a.id, v.id, g.target_project_id, 'licensed_copy', g.licensee_id);
  RETURN jsonb_build_object('grant', to_jsonb(g), 'copy', jsonb_build_object('id', copy_row.id, 'copy_asset_id', copy_asset.id, 'target_project_id', copy_row.target_project_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_usage_grant(p_grant_id UUID, p_user_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.storyflow_v2_usage_grants%ROWTYPE; preserved_count INTEGER;
BEGIN
  SELECT * INTO g FROM public.storyflow_v2_usage_grants WHERE id = p_grant_id AND licensor_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'usage grant not found or caller is not the licensor'; END IF;
  IF g.status IN ('cancelled', 'expired', 'disputed', 'revoked_for_new_use') THEN RAISE EXCEPTION 'usage grant cannot be revoked in current state'; END IF;
  UPDATE public.storyflow_v2_usage_grants SET status = 'revoked_for_new_use', revoked_reason = p_reason, updated_at = now() WHERE id = g.id RETURNING * INTO g;
  SELECT count(*) INTO preserved_count FROM public.storyflow_v2_asset_copies WHERE grant_id = g.id;
  RETURN jsonb_build_object('grant', to_jsonb(g), 'preservedCopyCount', preserved_count);
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_usage_grant(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_usage_grant(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_usage_grant(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_usage_grant(UUID, UUID, TEXT) TO service_role;
