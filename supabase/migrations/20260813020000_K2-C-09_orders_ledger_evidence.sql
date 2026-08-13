-- K2-C-09: orders, payments, reconciliable creator ledger, manual settlements, and factual evidence.

CREATE TABLE IF NOT EXISTS public.storyflow_v2_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.storyflow_v2_license_offers(id) ON DELETE RESTRICT,
  grant_id UUID NOT NULL UNIQUE REFERENCES public.storyflow_v2_usage_grants(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.storyflow_v2_assets(id) ON DELETE RESTRICT,
  asset_version_id UUID NOT NULL REFERENCES public.storyflow_v2_asset_versions(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  license_terms_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  manual_settlement_notice TEXT NOT NULL DEFAULT 'manual_settlement_required',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storyflow_v2_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.storyflow_v2_orders(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storyflow_v2_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.storyflow_v2_orders(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES public.storyflow_v2_payments(id) ON DELETE RESTRICT,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'platform_fee', 'refund', 'adjustment')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'reversed')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storyflow_v2_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ledger_entry_id UUID REFERENCES public.storyflow_v2_ledger_entries(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'disputed')),
  settlement_method TEXT NOT NULL DEFAULT 'manual',
  manual_settlement_notice TEXT NOT NULL DEFAULT 'manual_settlement_required',
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  settled_at TIMESTAMPTZ,
  dispute_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storyflow_v2_evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('generation_completed', 'asset_confirmed', 'asset_published', 'license_granted', 'export_released')),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('project', 'universe', 'asset', 'asset_version', 'usage_grant')),
  subject_id TEXT NOT NULL,
  asset_id UUID REFERENCES public.storyflow_v2_assets(id) ON DELETE RESTRICT,
  project_id TEXT,
  usage_grant_id UUID REFERENCES public.storyflow_v2_usage_grants(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.storyflow_v2_orders(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary TEXT,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT (facts ? 'legalDecision') AND NOT (facts ? 'legal_decision'))
);

CREATE INDEX IF NOT EXISTS storyflow_v2_orders_participant_idx ON public.storyflow_v2_orders(buyer_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storyflow_v2_payments_order_idx ON public.storyflow_v2_payments(order_id, status);
CREATE INDEX IF NOT EXISTS storyflow_v2_ledger_creator_idx ON public.storyflow_v2_ledger_entries(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storyflow_v2_settlements_creator_idx ON public.storyflow_v2_settlements(creator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS storyflow_v2_evidence_asset_idx ON public.storyflow_v2_evidence_events(asset_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS storyflow_v2_evidence_project_idx ON public.storyflow_v2_evidence_events(project_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.storyflow_v2_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS storyflow_v2_orders_updated_at ON public.storyflow_v2_orders;
CREATE TRIGGER storyflow_v2_orders_updated_at BEFORE UPDATE ON public.storyflow_v2_orders FOR EACH ROW EXECUTE FUNCTION public.storyflow_v2_touch_updated_at();
DROP TRIGGER IF EXISTS storyflow_v2_payments_updated_at ON public.storyflow_v2_payments;
CREATE TRIGGER storyflow_v2_payments_updated_at BEFORE UPDATE ON public.storyflow_v2_payments FOR EACH ROW EXECUTE FUNCTION public.storyflow_v2_touch_updated_at();
DROP TRIGGER IF EXISTS storyflow_v2_settlements_updated_at ON public.storyflow_v2_settlements;
CREATE TRIGGER storyflow_v2_settlements_updated_at BEFORE UPDATE ON public.storyflow_v2_settlements FOR EACH ROW EXECUTE FUNCTION public.storyflow_v2_touch_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_storyflow_v2_order_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.order_status = NEW.order_status THEN RETURN NEW; END IF;
  IF NOT ((OLD.order_status = 'pending' AND NEW.order_status IN ('paid', 'failed', 'cancelled')) OR
          (OLD.order_status = 'paid' AND NEW.order_status = 'refunded') OR
          (OLD.order_status = 'failed' AND NEW.order_status = 'cancelled') OR
          (OLD.order_status IN ('refunded', 'cancelled') AND NEW.order_status = OLD.order_status)) THEN
    RAISE EXCEPTION 'invalid order status transition: % -> %', OLD.order_status, NEW.order_status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS storyflow_v2_order_transition ON public.storyflow_v2_orders;
CREATE TRIGGER storyflow_v2_order_transition BEFORE UPDATE OF order_status ON public.storyflow_v2_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_storyflow_v2_order_transition();

CREATE OR REPLACE FUNCTION public.enforce_storyflow_v2_payment_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status OR
     (OLD.status = 'pending' AND NEW.status IN ('processing', 'succeeded', 'failed', 'cancelled')) OR
     (OLD.status = 'processing' AND NEW.status IN ('succeeded', 'failed', 'cancelled')) OR
     (OLD.status = 'failed' AND NEW.status = 'cancelled') OR
     (OLD.status = 'succeeded' AND NEW.status = 'refunded') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'invalid payment status transition: % -> %', OLD.status, NEW.status;
END;
$$;
DROP TRIGGER IF EXISTS storyflow_v2_payment_transition ON public.storyflow_v2_payments;
CREATE TRIGGER storyflow_v2_payment_transition BEFORE UPDATE OF status ON public.storyflow_v2_payments FOR EACH ROW EXECUTE FUNCTION public.enforce_storyflow_v2_payment_transition();

CREATE OR REPLACE FUNCTION public.enforce_storyflow_v2_settlement_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status OR (OLD.status = 'pending' AND NEW.status IN ('settled', 'disputed')) OR (OLD.status = 'settled' AND NEW.status = 'disputed') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'invalid settlement status transition: % -> %', OLD.status, NEW.status;
END;
$$;
DROP TRIGGER IF EXISTS storyflow_v2_settlement_transition ON public.storyflow_v2_settlements;
CREATE TRIGGER storyflow_v2_settlement_transition BEFORE UPDATE OF status ON public.storyflow_v2_settlements FOR EACH ROW EXECUTE FUNCTION public.enforce_storyflow_v2_settlement_transition();

CREATE OR REPLACE FUNCTION public.create_storyflow_v2_order_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.storyflow_v2_payments(order_id, amount_cents, currency) VALUES (NEW.id, NEW.amount_cents, NEW.currency);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS storyflow_v2_order_payment ON public.storyflow_v2_orders;
CREATE TRIGGER storyflow_v2_order_payment AFTER INSERT ON public.storyflow_v2_orders FOR EACH ROW EXECUTE FUNCTION public.create_storyflow_v2_order_payment();

CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id UUID, p_payment_id UUID, p_provider_reference TEXT, p_confirmed_by UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.storyflow_v2_orders%ROWTYPE; p public.storyflow_v2_payments%ROWTYPE; g public.storyflow_v2_usage_grants%ROWTYPE; fee INTEGER;
BEGIN
  SELECT * INTO o FROM public.storyflow_v2_orders WHERE id = p_order_id FOR UPDATE;
  SELECT * INTO p FROM public.storyflow_v2_payments WHERE id = p_payment_id AND order_id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'order or payment not found'; END IF;
  IF o.order_status IN ('refunded', 'cancelled') OR p.status IN ('refunded', 'failed') THEN RAISE EXCEPTION 'payment cannot be confirmed in current state'; END IF;
  SELECT * INTO g FROM public.storyflow_v2_usage_grants WHERE id = o.grant_id FOR UPDATE;
  IF g.id IS NULL OR g.status NOT IN ('pending', 'active') THEN RAISE EXCEPTION 'usage grant cannot be activated'; END IF;
  UPDATE public.storyflow_v2_payments SET status = 'succeeded', provider_reference = p_provider_reference, confirmed_by = p_confirmed_by, confirmed_at = now(), failure_reason = NULL WHERE id = p.id RETURNING * INTO p;
  UPDATE public.storyflow_v2_orders SET payment_status = 'succeeded', order_status = 'paid' WHERE id = o.id RETURNING * INTO o;
  IF g.status = 'pending' THEN UPDATE public.storyflow_v2_usage_grants SET status = 'active', updated_at = now() WHERE id = g.id RETURNING * INTO g; END IF;
  fee := floor(o.amount_cents * 1000 / 10000.0);
  IF NOT EXISTS (SELECT 1 FROM public.storyflow_v2_ledger_entries WHERE order_id = o.id AND entry_type = 'income' AND status = 'posted') THEN
    INSERT INTO public.storyflow_v2_ledger_entries(order_id, payment_id, creator_id, entry_type, amount_cents, currency, description) VALUES
      (o.id, p.id, o.seller_id, 'income', o.amount_cents, o.currency, 'Gross order income'),
      (o.id, p.id, o.seller_id, 'platform_fee', fee, o.currency, 'Platform service fee');
  END IF;
  RETURN jsonb_build_object('order', to_jsonb(o), 'payment', to_jsonb(p), 'grant_status', g.status, 'gross_income_cents', o.amount_cents, 'platform_fee_cents', fee, 'net_income_cents', net);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_order_payment(p_order_id UUID, p_payment_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.storyflow_v2_orders%ROWTYPE; p public.storyflow_v2_payments%ROWTYPE; g public.storyflow_v2_usage_grants%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.storyflow_v2_orders WHERE id = p_order_id FOR UPDATE;
  SELECT * INTO p FROM public.storyflow_v2_payments WHERE id = p_payment_id AND order_id = p_order_id FOR UPDATE;
  SELECT * INTO g FROM public.storyflow_v2_usage_grants WHERE id = o.grant_id;
  IF o.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'order or payment not found'; END IF;
  IF o.order_status <> 'pending' OR p.status IN ('succeeded', 'refunded') THEN RAISE EXCEPTION 'payment cannot fail in current state'; END IF;
  UPDATE public.storyflow_v2_payments SET status = 'failed', failure_reason = p_reason WHERE id = p.id RETURNING * INTO p;
  UPDATE public.storyflow_v2_orders SET payment_status = 'failed', order_status = 'failed' WHERE id = o.id RETURNING * INTO o;
  RETURN jsonb_build_object('order', to_jsonb(o), 'payment', to_jsonb(p), 'grant_status', g.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_order(p_order_id UUID, p_actor_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.storyflow_v2_orders%ROWTYPE; p public.storyflow_v2_payments%ROWTYPE; g public.storyflow_v2_usage_grants%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.storyflow_v2_orders WHERE id = p_order_id AND (buyer_id = p_actor_id OR seller_id = p_actor_id) FOR UPDATE;
  SELECT * INTO p FROM public.storyflow_v2_payments WHERE order_id = p_order_id FOR UPDATE;
  SELECT * INTO g FROM public.storyflow_v2_usage_grants WHERE id = o.grant_id FOR UPDATE;
  IF o.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'order not found or actor is not a participant'; END IF;
  IF o.order_status IN ('refunded', 'cancelled') THEN RAISE EXCEPTION 'order already closed'; END IF;
  IF g.status = 'pending' THEN UPDATE public.storyflow_v2_usage_grants SET status = 'cancelled', revoked_reason = p_reason, updated_at = now() WHERE id = g.id RETURNING * INTO g;
  ELSIF g.status = 'active' THEN UPDATE public.storyflow_v2_usage_grants SET status = 'revoked_for_new_use', revoked_reason = p_reason, updated_at = now() WHERE id = g.id RETURNING * INTO g;
  END IF;
  UPDATE public.storyflow_v2_payments SET status = CASE WHEN p.status = 'succeeded' THEN 'refunded' ELSE 'cancelled' END, failure_reason = p_reason WHERE id = p.id RETURNING * INTO p;
  UPDATE public.storyflow_v2_orders SET payment_status = CASE WHEN p.status = 'refunded' THEN 'refunded' ELSE 'cancelled' END, order_status = CASE WHEN p.status = 'refunded' THEN 'refunded' ELSE 'cancelled' END WHERE id = o.id RETURNING * INTO o;
  IF p.status = 'refunded' THEN INSERT INTO public.storyflow_v2_ledger_entries(order_id, payment_id, creator_id, entry_type, amount_cents, currency, description) VALUES (o.id, p.id, o.seller_id, 'refund', -o.amount_cents, o.currency, 'Order refund'); END IF;
  RETURN jsonb_build_object('order', to_jsonb(o), 'payment', to_jsonb(p), 'grant_status', g.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_manual_settlement(p_settlement_id UUID, p_admin_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.storyflow_v2_settlements%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.storyflow_admin_roles WHERE user_id = p_admin_id AND role IN ('super_admin', 'operator')) THEN RAISE EXCEPTION 'administrator role required'; END IF;
  SELECT * INTO s FROM public.storyflow_v2_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF s.id IS NULL OR p_status NOT IN ('settled', 'disputed') THEN RAISE EXCEPTION 'invalid manual settlement update'; END IF;
  UPDATE public.storyflow_v2_settlements SET status = p_status, handled_by = p_admin_id, settled_at = CASE WHEN p_status = 'settled' THEN now() ELSE settled_at END, dispute_reason = CASE WHEN p_status = 'disputed' THEN p_note ELSE dispute_reason END, updated_at = now() WHERE id = s.id RETURNING * INTO s;
  RETURN jsonb_build_object('settlement', to_jsonb(s), 'manual_settlement', true, 'notice', 'manual_settlement_required');
END;
$$;

ALTER TABLE public.storyflow_v2_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_v2_evidence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY storyflow_v2_orders_participant_read ON public.storyflow_v2_orders FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY storyflow_v2_payments_participant_read ON public.storyflow_v2_payments FOR SELECT USING (EXISTS (SELECT 1 FROM public.storyflow_v2_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())));
CREATE POLICY storyflow_v2_ledger_creator_read ON public.storyflow_v2_ledger_entries FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY storyflow_v2_settlements_creator_read ON public.storyflow_v2_settlements FOR SELECT USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.storyflow_admin_roles r WHERE r.user_id = auth.uid()));
CREATE POLICY storyflow_v2_evidence_actor_read ON public.storyflow_v2_evidence_events FOR SELECT USING (actor_id = auth.uid());

REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_order_payment(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_order(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_manual_settlement(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(UUID, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_order_payment(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_order(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_manual_settlement(UUID, UUID, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.storyflow_v2_evidence_events IS 'Evidence records facts and does not make legal determinations.';

CREATE OR REPLACE FUNCTION public.prevent_storyflow_v2_evidence_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evidence Events are append-only factual records';
END;
$$;
DROP TRIGGER IF EXISTS storyflow_v2_evidence_append_only ON public.storyflow_v2_evidence_events;
CREATE TRIGGER storyflow_v2_evidence_append_only BEFORE UPDATE OR DELETE ON public.storyflow_v2_evidence_events FOR EACH ROW EXECUTE FUNCTION public.prevent_storyflow_v2_evidence_mutation();
