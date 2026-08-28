-- Self-contained repair of the dependencies used by /actors/purchased and /api/v2/kk.
-- Production never received the older foundation/profile migrations. Do not
-- deploy unrelated marketplace payouts, KK cosmetics, or milestone rewards here.
BEGIN;

DO $orders$
DECLARE existed boolean := to_regclass('public.storyflow_actor_orders') IS NOT NULL;
BEGIN
CREATE TABLE IF NOT EXISTS public.storyflow_actor_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.storyflow_actor_profiles(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id text REFERENCES public.storyflow_projects(id) ON DELETE SET NULL,
  price_kk int NOT NULL CHECK (price_kk >= 0),
  platform_fee_kk int NOT NULL DEFAULT 0 CHECK (platform_fee_kk >= 0),
  seller_revenue_kk int NOT NULL DEFAULT 0 CHECK (seller_revenue_kk >= 0),
  platform_fee_rate int NOT NULL DEFAULT 1 CHECK (platform_fee_rate BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded','revoked')),
  paid_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);
IF NOT existed THEN
  REVOKE ALL ON public.storyflow_actor_orders FROM service_role;
END IF;
END;
$orders$;
CREATE INDEX IF NOT EXISTS idx_actor_orders_buyer ON public.storyflow_actor_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_actor_orders_seller ON public.storyflow_actor_orders(seller_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_actor_orders_actor_buyer_project
  ON public.storyflow_actor_orders(actor_id, buyer_id, COALESCE(project_id, '__no_project__'))
  WHERE status = 'paid';
ALTER TABLE public.storyflow_actor_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS actor_orders_self_read ON public.storyflow_actor_orders;
CREATE POLICY actor_orders_self_read ON public.storyflow_actor_orders FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());
REVOKE ALL ON public.storyflow_actor_orders FROM anon, authenticated;
GRANT SELECT ON public.storyflow_actor_orders TO authenticated;
-- Purchase writes stay disabled until the complete order/revenue migration is deployed.
GRANT SELECT ON public.storyflow_actor_orders TO service_role;

CREATE TABLE IF NOT EXISTS public.storyflow_kk_profiles (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name text NOT NULL DEFAULT '',
  equipped_item_id text,
  equipped_item_version text,
  profile_display boolean NOT NULL DEFAULT false,
  community_display boolean NOT NULL DEFAULT false,
  growth_level integer NOT NULL DEFAULT 0 CHECK (growth_level >= 0),
  growth_xp integer NOT NULL DEFAULT 0 CHECK (growth_xp >= 0),
  recent_project_id uuid,
  recent_universe_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.storyflow_kk_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kk_profiles_owner_select ON public.storyflow_kk_profiles;
CREATE POLICY kk_profiles_owner_select ON public.storyflow_kk_profiles
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.storyflow_entitlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  item_id text NOT NULL,
  item_version text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('grant', 'revoke')),
  source_type text NOT NULL CHECK (source_type IN ('system_migration', 'creative_milestone', 'subscription', 'admin_grant')),
  source_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_entitlement_ledger_owner ON public.storyflow_entitlement_ledger(owner_id, created_at);
ALTER TABLE public.storyflow_entitlement_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entitlement_ledger_owner_select ON public.storyflow_entitlement_ledger;
CREATE POLICY entitlement_ledger_owner_select ON public.storyflow_entitlement_ledger
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
-- All writes originate from authenticated server routes, never direct client XP grants.
REVOKE ALL ON public.storyflow_kk_profiles, public.storyflow_entitlement_ledger FROM anon, authenticated;
GRANT SELECT ON public.storyflow_kk_profiles, public.storyflow_entitlement_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.storyflow_kk_profiles TO service_role;
REVOKE UPDATE, DELETE ON public.storyflow_entitlement_ledger FROM service_role;
GRANT SELECT, INSERT ON public.storyflow_entitlement_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.compute_net_entitlements(p_owner_id uuid)
RETURNS TABLE (item_id text, item_version text, net_count bigint)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT item_id, item_version, sum(CASE direction WHEN 'grant' THEN 1 ELSE -1 END)
  FROM public.storyflow_entitlement_ledger WHERE owner_id = p_owner_id
  GROUP BY item_id, item_version
  HAVING sum(CASE direction WHEN 'grant' THEN 1 ELSE -1 END) > 0;
$$;
REVOKE EXECUTE ON FUNCTION public.compute_net_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_net_entitlements(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.storyflow_creative_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  event_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_version text,
  task_id uuid,
  idempotency_key text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private', 'collaborators', 'public')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS storyflow_creative_events_owner_sequence_idx
  ON public.storyflow_creative_events(owner_id, sequence);
ALTER TABLE public.storyflow_creative_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_creative_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storyflow_creative_events_owner_select ON public.storyflow_creative_events;
CREATE POLICY storyflow_creative_events_owner_select ON public.storyflow_creative_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.storyflow_creative_events FROM anon, authenticated;
GRANT SELECT ON public.storyflow_creative_events TO authenticated;
REVOKE UPDATE, DELETE ON public.storyflow_creative_events FROM service_role;
GRANT SELECT, INSERT ON public.storyflow_creative_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.storyflow_creative_events_sequence_seq TO service_role;

CREATE OR REPLACE FUNCTION public.storyflow_creative_events_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'storyflow_creative_events is append-only: % not allowed', TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS storyflow_creative_events_immutable_guard ON public.storyflow_creative_events;
CREATE TRIGGER storyflow_creative_events_immutable_guard BEFORE UPDATE OR DELETE
  ON public.storyflow_creative_events FOR EACH ROW
  EXECUTE FUNCTION public.storyflow_creative_events_immutable_guard();

CREATE OR REPLACE FUNCTION public.append_creative_event(
  p_event_type text, p_schema_version integer, p_actor_type text, p_actor_id uuid,
  p_owner_id uuid, p_resource_type text, p_resource_id text, p_resource_version text,
  p_task_id uuid, p_idempotency_key text, p_visibility text, p_payload jsonb, p_occurred_at timestamptz
) RETURNS public.storyflow_creative_events
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row public.storyflow_creative_events;
BEGIN
  INSERT INTO public.storyflow_creative_events (
    event_type, schema_version, actor_type, actor_id, owner_id, resource_type,
    resource_id, resource_version, task_id, idempotency_key, visibility, payload, occurred_at
  ) VALUES (
    p_event_type, p_schema_version, p_actor_type, p_actor_id, p_owner_id, p_resource_type,
    p_resource_id, p_resource_version, p_task_id, p_idempotency_key, p_visibility,
    COALESCE(p_payload, '{}'::jsonb), p_occurred_at
  ) ON CONFLICT (owner_id, idempotency_key) DO NOTHING RETURNING * INTO v_row;
  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM public.storyflow_creative_events
      WHERE owner_id = p_owner_id AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.append_creative_event(text,integer,text,uuid,uuid,text,text,text,uuid,text,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_creative_event(text,integer,text,uuid,uuid,text,text,text,uuid,text,text,jsonb,timestamptz) TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public' AND tablename = 'storyflow_creative_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.storyflow_creative_events;
  END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
