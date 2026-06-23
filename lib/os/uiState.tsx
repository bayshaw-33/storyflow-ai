"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { PlanId } from "@/lib/billing/plans";
import type { TierId } from "@/lib/pricing/tiers";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// ── The single source of truth for the whole UI OS ──────────────
export type ActiveSystem = "hero" | "workspace" | "universe" | "pricing";
export type KKMirror = "idle" | "thinking" | "happy" | "guide";

export type Access = {
  workspaceFull: boolean; // ELITE+
  universe: boolean; // ULTRA tier only
  fullKK: boolean; // PRO+ unlocks full KK behaviour (guide mode)
};

type UIState = {
  activeSystem: ActiveSystem;
  kkState: KKMirror;
  selectedNode: string | null;
  selectedWorkspaceModule: string | null;
  selectedPricingTier: TierId | null;
  planId: PlanId;
  planReady: boolean;
  access: Access;
};

type OSApi = UIState & {
  setKkState: (state: KKMirror) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedWorkspaceModule: (id: string | null) => void;
  selectPricingTier: (tier: TierId, planId: PlanId) => void;
};

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  elite: 1,
  pro: 2,
  ultra: 3,
};

const PLAN_STORAGE_KEY = "kiikis_plan_id";

function accessFor(planId: PlanId): Access {
  const rank = PLAN_RANK[planId] ?? 0;
  return {
    workspaceFull: rank >= 1,
    universe: rank >= 3,
    fullKK: rank >= 2,
  };
}

function systemForPath(path: string | null): ActiveSystem {
  if (!path) return "hero";
  if (path === "/") return "hero";
  if (path.startsWith("/universes")) return "universe";
  if (path.startsWith("/subscription")) return "pricing";
  return "workspace"; // dashboard, projects, settings, templates, companions…
}

const OSContext = createContext<OSApi | null>(null);

export function useOS(): OSApi {
  const ctx = useContext(OSContext);
  if (!ctx) throw new Error("useOS must be used within <OSProvider>");
  return ctx;
}

export function OSProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeSystem = systemForPath(pathname);

  const [kkState, setKkState] = useState<KKMirror>("idle");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedWorkspaceModule, setSelectedWorkspaceModule] = useState<string | null>(null);
  const [selectedPricingTier, setSelectedPricingTier] = useState<TierId | null>(null);
  const [planId, setPlanId] = useState<PlanId>("free");
  const [planReady, setPlanReady] = useState(false);

  // hydrate plan from localStorage (fast) then Supabase profile (authoritative)
  useEffect(() => {
    // localStorage migration: "universe" was renamed to "ultra"
    let cached = window.localStorage.getItem(PLAN_STORAGE_KEY) as string | null;
    if (cached === "universe") {
      cached = "ultra";
      window.localStorage.setItem(PLAN_STORAGE_KEY, "ultra");
    }
    if (cached && cached in PLAN_RANK) setPlanId(cached as PlanId);

    // Supabase is authoritative; delay planReady until it resolves
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setPlanReady(true); return; }

    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user) { setPlanReady(true); return; }
      try {
        const { data: profile } = await supabase
          .from("storyflow_profiles")
          .select("plan")
          .eq("user_id", user.id)
          .maybeSingle();
        const raw = profile?.plan as string | null | undefined;
        const normalized = raw === "universe" ? "ultra" : raw;
        if (normalized && normalized in PLAN_RANK) {
          window.localStorage.setItem(PLAN_STORAGE_KEY, normalized);
          setPlanId(normalized as PlanId);
        }
      } finally {
        setPlanReady(true);
      }
    });
  }, []);

  const updateKkState = useCallback((next: KKMirror) => {
    setKkState((current) => (current === next ? current : next));
  }, []);

  const updateSelectedNode = useCallback((id: string | null) => {
    setSelectedNode((current) => (current === id ? current : id));
  }, []);

  const updateSelectedWorkspaceModule = useCallback((id: string | null) => {
    setSelectedWorkspaceModule((current) => (current === id ? current : id));
  }, []);

  const selectPricingTier = useCallback((tier: TierId, nextPlan: PlanId) => {
    setSelectedPricingTier((current) => (current === tier ? current : tier));
    setPlanId((current) => (current === nextPlan ? current : nextPlan));
    window.localStorage.setItem(PLAN_STORAGE_KEY, nextPlan);
  }, []);

  const access = useMemo(() => accessFor(planId), [planId]);

  const value = useMemo<OSApi>(
    () => ({
      activeSystem,
      kkState,
      selectedNode,
      selectedWorkspaceModule,
      selectedPricingTier,
      planId,
      planReady,
      access,
      setKkState: updateKkState,
      setSelectedNode: updateSelectedNode,
      setSelectedWorkspaceModule: updateSelectedWorkspaceModule,
      selectPricingTier,
    }),
    [
      activeSystem,
      kkState,
      selectedNode,
      selectedWorkspaceModule,
      selectedPricingTier,
      planId,
      planReady,
      access,
      updateKkState,
      updateSelectedNode,
      updateSelectedWorkspaceModule,
      selectPricingTier,
    ],
  );

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>;
}
