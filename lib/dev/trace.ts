// KIIKIS DX — Asset traceability + global debug state + AI debug hooks.
//
// The store lives on globalThis so it survives Fast Refresh (HMR): DEV_STATE,
// asset-load map, and KK transitions are NOT reset on hot reload.

import { ComponentRegistry } from "@/lib/dev/registry";

export const DEV = process.env.NODE_ENV !== "production";

export type TraceKind = "asset" | "render" | "state" | "transition";

export type TraceEntry = {
  kind: TraceKind;
  component?: string;
  asset?: string;
  status?: string;
  detail?: unknown;
  timestamp: number;
};

export type AssetStatus = "pending" | "loaded" | "error";

export type DevStore = {
  renderCount: number;
  assetLoadMap: Record<string, AssetStatus>;
  kkStateTransitions: { from: string | null; to: string; at: number }[];
  universeNodeCount: number;
  workspaceActiveModule: string | null;
  activeSystem: string | null;
  uiState: unknown;
  traceLog: TraceEntry[];
};

const STORE_KEY = "__KIIKIS_DEV_STORE__";
const TRACE_CAP = 500;

export function devStore(): DevStore {
  const g = globalThis as unknown as Record<string, DevStore | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      renderCount: 0,
      assetLoadMap: {},
      kkStateTransitions: [],
      universeNodeCount: 0,
      workspaceActiveModule: null,
      activeSystem: null,
      uiState: null,
      traceLog: [],
    };
  }
  return g[STORE_KEY] as DevStore;
}

function record(entry: TraceEntry) {
  const store = devStore();
  store.traceLog.push(entry);
  if (store.traceLog.length > TRACE_CAP) store.traceLog.splice(0, store.traceLog.length - TRACE_CAP);
}

function log(label: string, lines: Record<string, unknown>) {
  if (!DEV) return;
  const body = Object.entries(lines)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.debug(`[${label}]\n${body}`);
}

// ── Trace emitters ──────────────────────────────────────────────
export function traceAsset(asset: string, status: AssetStatus, component = "DesignAssetImage") {
  if (!DEV) return;
  const store = devStore();
  store.assetLoadMap[asset] = status;
  record({ kind: "asset", component, asset, status, timestamp: Date.now() });
  log("ASSET_TRACE", { component, asset, status, timestamp: "now()" });
}

export function traceRender(component: string) {
  if (!DEV) return;
  devStore().renderCount += 1;
  record({ kind: "render", component, timestamp: Date.now() });
}

export function traceState(component: string, detail: unknown) {
  if (!DEV) return;
  record({ kind: "state", component, detail, timestamp: Date.now() });
  log("STATE_TRACE", { component, detail });
}

export function traceTransition(from: string | null, to: string) {
  if (!DEV || from === to) return;
  const store = devStore();
  store.kkStateTransitions.push({ from, to, at: Date.now() });
  if (store.kkStateTransitions.length > TRACE_CAP) store.kkStateTransitions.shift();
  record({ kind: "transition", detail: { from, to }, timestamp: Date.now() });
  log("SYSTEM_TRACE", { from: from ?? "—", to, timestamp: "now()" });
}

// ── AI debug hooks (structured JSON) ────────────────────────────
export function getSystemSnapshot() {
  const s = devStore();
  return {
    timestamp: Date.now(),
    activeSystem: s.activeSystem,
    uiState: s.uiState,
    kk: {
      transitions: s.kkStateTransitions.slice(-20),
    },
    counts: {
      renders: s.renderCount,
      universeNodes: s.universeNodeCount,
    },
    workspaceActiveModule: s.workspaceActiveModule,
  };
}

export function getAssetGraph() {
  const s = devStore();
  const byComponent: Record<string, string[]> = {};
  for (const [name, meta] of Object.entries(ComponentRegistry)) {
    byComponent[name] = meta.assets;
  }
  return { assetLoadMap: s.assetLoadMap, byComponent };
}

export function getStateTree() {
  return { registry: ComponentRegistry, store: devStore() };
}

// Install the AI co-pilot read API on window (client, dev only).
export function installDevApi() {
  if (!DEV || typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__KIIKIS_DEV__ = {
    getSystemSnapshot,
    getAssetGraph,
    getStateTree,
    getStore: devStore,
    registry: ComponentRegistry,
  };
}
