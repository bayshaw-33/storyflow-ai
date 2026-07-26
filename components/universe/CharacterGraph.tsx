"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, ZoomIn, ZoomOut, Maximize2, Trash2, Edit3 } from "lucide-react";
import {
  computeCharacterLayout,
  getNeighbors,
} from "@/lib/universe/character-graph-layout";
import type {
  CharacterNode,
  CharacterEdge,
} from "@/lib/universe/character-graph-queries";
import type { CanonStatus } from "@/lib/universe";

type CharacterGraphProps = {
  universeId: string;
  accessToken: string | null;
  isZh: boolean;
};

type ViewBox = { x: number; y: number; w: number; h: number };

const DEFAULT_VIEW: ViewBox = { x: 0, y: 0, w: 100, h: 100 };
const MIN_W = 20;
const MAX_W = 200;

const STATUS_COLORS: Record<CanonStatus, string> = {
  canon: "#4ade80",
  draft: "#fbbf24",
  alternative: "#a78bfa",
  deprecated: "#6b7280",
};

const STATUS_LABELS_ZH: Record<CanonStatus, string> = {
  canon: "正史",
  draft: "草稿",
  alternative: "平行",
  deprecated: "废弃",
};

const STATUS_LABELS_EN: Record<CanonStatus, string> = {
  canon: "Canon",
  draft: "Draft",
  alternative: "Alt",
  deprecated: "Deprecated",
};

type SelectedTarget =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

export const CharacterGraph = memo(function CharacterGraph({
  universeId,
  accessToken,
  isZh,
}: CharacterGraphProps) {
  const [nodes, setNodes] = useState<CharacterNode[]>([]);
  const [edges, setEdges] = useState<CharacterEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedTarget>(null);
  const [view, setView] = useState<ViewBox>(DEFAULT_VIEW);
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; vbx: number; vby: number } | null>(null);

  const copy = useMemo(() => getGraphCopy(isZh), [isZh]);

  const reload = useCallback(async () => {
    if (!accessToken) {
      setError(isZh ? "请先登录" : "Please sign in first");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/character-graph`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "load failed");
      }
      setNodes(data.nodes ?? []);
      setEdges(data.edges ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [accessToken, universeId, isZh]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const layout = useMemo(
    () => computeCharacterLayout(
      nodes.map((n) => n.id),
      edges.map((e) => ({ source_entity_id: e.source_entity_id, target_entity_id: e.target_entity_id })),
    ),
    [nodes, edges],
  );

  const visibleEdges = useMemo(
    () => (showDeprecated ? edges : edges.filter((e) => e.status !== "deprecated")),
    [edges, showDeprecated],
  );

  const visibleNodes = useMemo(
    () => (showDeprecated ? nodes : nodes.filter((n) => n.status !== "deprecated")),
    [nodes, showDeprecated],
  );

  const searchLower = search.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    if (!searchLower) return null;
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.name.toLowerCase().includes(searchLower) || n.summary.toLowerCase().includes(searchLower)) {
        set.add(n.id);
      }
    }
    return set;
  }, [nodes, searchLower]);

  const neighborSet = useMemo(() => {
    if (selected?.kind !== "node") return null;
    return getNeighbors(
      selected.id,
      visibleEdges.map((e) => ({ source_entity_id: e.source_entity_id, target_entity_id: e.target_entity_id })),
    );
  }, [selected, visibleEdges]);

  const selectedNode = useMemo(() => {
    if (selected?.kind !== "node") return null;
    return nodes.find((n) => n.id === selected.id) ?? null;
  }, [selected, nodes]);

  const selectedEdge = useMemo(() => {
    if (selected?.kind !== "edge") return null;
    return edges.find((e) => e.id === selected.id) ?? null;
  }, [selected, edges]);

  const selectedEdgeNodes = useMemo(() => {
    if (!selectedEdge) return null;
    const source = nodes.find((n) => n.id === selectedEdge.source_entity_id);
    const target = nodes.find((n) => n.id === selectedEdge.target_entity_id);
    return { source, target };
  }, [selectedEdge, nodes]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.tagName === "circle" || target.tagName === "text" || target.tagName === "line" || target.closest("[data-node-id]") || target.closest("[data-edge-id]")) {
      return;
    }
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      vbx: view.x,
      vby: view.y,
    };
  }, [view]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragState.current.startX) / rect.width) * view.w;
    const dy = ((e.clientY - dragState.current.startY) / rect.height) * view.h;
    setView((v) => ({ ...v, x: dragState.current!.vbx - dx, y: dragState.current!.vby - dy }));
  }, [view.w, view.h]);

  const handleMouseUp = useCallback(() => {
    dragState.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    setView((v) => {
      const newW = Math.max(MIN_W, Math.min(MAX_W, v.w * factor));
      const newH = newW;
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return { x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
    });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setView((v) => {
      const newW = Math.max(MIN_W, Math.min(MAX_W, v.w * factor));
      const newH = newW;
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return { x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
    });
  }, []);

  const resetView = useCallback(() => setView(DEFAULT_VIEW), []);

  const selectNode = useCallback((id: string) => {
    setSelected({ kind: "node", id });
  }, []);

  const selectEdge = useCallback((id: string) => {
    setSelected({ kind: "edge", id });
  }, []);

  const handleRelationshipCreated = useCallback(() => {
    setCreating(false);
    void reload();
  }, [reload]);

  const handleRelationshipUpdated = useCallback(() => {
    setEditing(false);
    void reload();
  }, [reload]);

  const handleRelationshipDeprecated = useCallback(async () => {
    if (!selectedEdge || !accessToken) return;
    if (!confirm(isZh ? "确定废弃此关系吗？" : "Deprecate this relationship?")) return;
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/relationships/${encodeURIComponent(selectedEdge.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "deprecate failed");
      setSelected(null);
      void reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "deprecate failed");
    }
  }, [selectedEdge, accessToken, universeId, isZh, reload]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
        {copy.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#f87171" }}>
        <p>{copy.loadFailed}: {error}</p>
        <button onClick={reload} style={{ marginTop: 8 }}>{copy.retry}</button>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
        <p style={{ margin: 0, fontSize: 14 }}>{copy.empty}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, minHeight: 520 }}>
      <div style={{ position: "relative", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", background: "rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={copy.searchPlaceholder}
              style={{ width: "100%", padding: "6px 8px 6px 28px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "inherit", fontSize: 13 }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, opacity: 0.7, cursor: "pointer" }}>
            <input type="checkbox" checked={showDeprecated} onChange={(e) => setShowDeprecated(e.target.checked)} />
            {copy.showDeprecated}
          </label>
          <button onClick={() => setCreating(true)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 4, color: "#a5b4fc", cursor: "pointer", fontSize: 12 }}>
            <Plus size={14} /> {copy.newRelationship}
          </button>
        </div>

        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: 460, cursor: dragState.current ? "grabbing" : "grab", display: "block" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {visibleEdges.map((edge) => {
            const from = layout.nodes.get(edge.source_entity_id);
            const to = layout.nodes.get(edge.target_entity_id);
            if (!from || !to) return null;
            const isHighlighted = neighborSet?.has(edge.source_entity_id) && neighborSet?.has(edge.target_entity_id);
            const isSelected = selected?.kind === "edge" && selected.id === edge.id;
            const isDimmed = neighborSet && !isHighlighted;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            return (
              <g
                key={edge.id}
                data-edge-id={edge.id}
                style={{ cursor: "pointer", opacity: isDimmed ? 0.15 : 1 }}
                onClick={(e) => { e.stopPropagation(); selectEdge(edge.id); }}
              >
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isSelected ? "#fff" : STATUS_COLORS[edge.status]}
                  strokeWidth={isSelected ? 0.8 : 0.4}
                  strokeDasharray={edge.status === "deprecated" ? "1,1" : undefined}
                />
                {edge.relationship_type && edge.relationship_type !== "related" ? (
                  <text
                    x={mx}
                    y={my}
                    fontSize={2.2}
                    fill={isSelected ? "#fff" : "rgba(255,255,255,0.7)"}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {edge.relationship_type}
                  </text>
                ) : null}
              </g>
            );
          })}

          {visibleNodes.map((node) => {
            const pos = layout.nodes.get(node.id);
            if (!pos) return null;
            const isSelected = selected?.kind === "node" && selected.id === node.id;
            const isMatched = matchedIds?.has(node.id);
            const isNeighbor = neighborSet?.has(node.id);
            const isDimmed = (matchedIds && !isMatched) || (neighborSet && !isNeighbor);
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                style={{ cursor: "pointer", opacity: isDimmed ? 0.2 : 1 }}
                onClick={(e) => { e.stopPropagation(); selectNode(node.id); }}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? 3.5 : 2.8}
                  fill={STATUS_COLORS[node.status]}
                  stroke={isSelected ? "#fff" : "rgba(0,0,0,0.3)"}
                  strokeWidth={isSelected ? 0.5 : 0.2}
                />
                <text
                  x={pos.x}
                  y={pos.y + 5}
                  fontSize={2.2}
                  fill={isMatched ? "#fde047" : "rgba(255,255,255,0.85)"}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 4 }}>
          <button onClick={() => zoomBy(0.8)} title={copy.zoomOut} style={iconBtnStyle}>
            <ZoomOut size={14} />
          </button>
          <button onClick={() => zoomBy(1.25)} title={copy.zoomIn} style={iconBtnStyle}>
            <ZoomIn size={14} />
          </button>
          <button onClick={resetView} title={copy.resetView} style={iconBtnStyle}>
            <Maximize2 size={14} />
          </button>
        </div>

        <div style={{ position: "absolute", top: 56, left: 8, display: "flex", flexDirection: "column", gap: 2, fontSize: 11, background: "rgba(0,0,0,0.4)", padding: 6, borderRadius: 4 }}>
          {(Object.keys(STATUS_COLORS) as CanonStatus[]).map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[s], display: "inline-block" }} />
              {isZh ? STATUS_LABELS_ZH[s] : STATUS_LABELS_EN[s]}
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: 520 }}>
        {selectedNode ? (
          <NodeDetail node={selectedNode} isZh={isZh} copy={copy} onClose={() => setSelected(null)} />
        ) : selectedEdge && selectedEdgeNodes ? (
          <EdgeDetail
            edge={selectedEdge}
            sourceName={selectedEdgeNodes.source?.name ?? "?"}
            targetName={selectedEdgeNodes.target?.name ?? "?"}
            isZh={isZh}
            copy={copy}
            onClose={() => setSelected(null)}
            onEdit={() => setEditing(true)}
            onDeprecate={handleRelationshipDeprecated}
          />
        ) : (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: 12 }}>
            {copy.hintSelect}
          </div>
        )}
      </div>

      {creating ? (
        <CreateRelationshipDialog
          universeId={universeId}
          accessToken={accessToken}
          nodes={nodes}
          isZh={isZh}
          copy={copy}
          onClose={() => setCreating(false)}
          onCreated={handleRelationshipCreated}
        />
      ) : null}

      {editing && selectedEdge ? (
        <EditRelationshipDialog
          universeId={universeId}
          accessToken={accessToken}
          edge={selectedEdge}
          isZh={isZh}
          copy={copy}
          onClose={() => setEditing(false)}
          onUpdated={handleRelationshipUpdated}
        />
      ) : null}
    </div>
  );
});

function NodeDetail({ node, isZh, copy, onClose }: { node: CharacterNode; isZh: boolean; copy: GraphCopy; onClose: () => void }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>{node.name}</h4>
        <button onClick={onClose} style={closeBtnStyle}><X size={14} /></button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={chipStyle(STATUS_COLORS[node.status])}>
          {isZh ? STATUS_LABELS_ZH[node.status] : STATUS_LABELS_EN[node.status]}
        </span>
        {node.tags.slice(0, 3).map((tag) => (
          <span key={tag} style={tagStyle}>{tag}</span>
        ))}
      </div>
      {node.summary ? (
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}>{node.summary}</p>
      ) : (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{copy.noSummary}</p>
      )}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        {copy.updated}: {new Date(node.updated_at).toLocaleString(isZh ? "zh-CN" : "en-US")}
      </div>
    </div>
  );
}

function EdgeDetail({ edge, sourceName, targetName, isZh, copy, onClose, onEdit, onDeprecate }: {
  edge: CharacterEdge;
  sourceName: string;
  targetName: string;
  isZh: boolean;
  copy: GraphCopy;
  onClose: () => void;
  onEdit: () => void;
  onDeprecate: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13 }}>{sourceName} → {targetName}</h4>
        <button onClick={onClose} style={closeBtnStyle}><X size={14} /></button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={chipStyle(STATUS_COLORS[edge.status])}>
          {isZh ? STATUS_LABELS_ZH[edge.status] : STATUS_LABELS_EN[edge.status]}
        </span>
        <span style={tagStyle}>{edge.relationship_type}</span>
        <span style={tagStyle}>{edge.relationship_status}</span>
      </div>
      {edge.summary ? (
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}>{edge.summary}</p>
      ) : null}
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button onClick={onEdit} style={primaryBtnStyle}>
          <Edit3 size={12} /> {copy.edit}
        </button>
        <button onClick={onDeprecate} style={dangerBtnStyle}>
          <Trash2 size={12} /> {copy.deprecate}
        </button>
      </div>
    </div>
  );
}

function CreateRelationshipDialog({ universeId, accessToken, nodes, isZh, copy, onClose, onCreated }: {
  universeId: string;
  accessToken: string | null;
  nodes: CharacterNode[];
  isZh: boolean;
  copy: GraphCopy;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relType, setRelType] = useState("related");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<CanonStatus>("canon");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!sourceId || !targetId) { setErr(copy.selectBoth); return; }
    if (sourceId === targetId) { setErr(copy.selfRefError); return; }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/relationships`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ source_entity_id: sourceId, target_entity_id: targetId, relationship_type: relType, summary, status }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "create failed");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell title={copy.newRelationship} onClose={onClose}>
      <Field label={copy.source}>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={selectStyle}>
          <option value="">{copy.selectNode}</option>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </Field>
      <Field label={copy.target}>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={selectStyle}>
          <option value="">{copy.selectNode}</option>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </Field>
      <Field label={copy.relType}>
        <input value={relType} onChange={(e) => setRelType(e.target.value)} style={inputStyle} placeholder="related" />
      </Field>
      <Field label={copy.summary}>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} style={textareaStyle} rows={2} />
      </Field>
      <Field label={copy.canonStatus}>
        <select value={status} onChange={(e) => setStatus(e.target.value as CanonStatus)} style={selectStyle}>
          {(Object.keys(STATUS_COLORS) as CanonStatus[]).map((s) => (
            <option key={s} value={s}>{isZh ? STATUS_LABELS_ZH[s] : STATUS_LABELS_EN[s]}</option>
          ))}
        </select>
      </Field>
      {err ? <p style={{ color: "#f87171", fontSize: 12, margin: "8px 0" }}>{err}</p> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={onClose} style={cancelBtnStyle}>{copy.cancel}</button>
        <button onClick={submit} disabled={submitting} style={primaryBtnStyle}>
          {submitting ? copy.creating : copy.create}
        </button>
      </div>
    </DialogShell>
  );
}

function EditRelationshipDialog({ universeId, accessToken, edge, isZh, copy, onClose, onUpdated }: {
  universeId: string;
  accessToken: string | null;
  edge: CharacterEdge;
  isZh: boolean;
  copy: GraphCopy;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [relType, setRelType] = useState(edge.relationship_type);
  const [relStatus, setRelStatus] = useState(edge.relationship_status);
  const [summary, setSummary] = useState(edge.summary);
  const [status, setStatus] = useState<CanonStatus>(edge.status);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/relationships/${encodeURIComponent(edge.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ relationship_type: relType, relationship_status: relStatus, summary, status }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "update failed");
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "update failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell title={copy.editRelationship} onClose={onClose}>
      <Field label={copy.relType}>
        <input value={relType} onChange={(e) => setRelType(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={copy.relStatus}>
        <input value={relStatus} onChange={(e) => setRelStatus(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={copy.summary}>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} style={textareaStyle} rows={2} />
      </Field>
      <Field label={copy.canonStatus}>
        <select value={status} onChange={(e) => setStatus(e.target.value as CanonStatus)} style={selectStyle}>
          {(Object.keys(STATUS_COLORS) as CanonStatus[]).map((s) => (
            <option key={s} value={s}>{isZh ? STATUS_LABELS_ZH[s] : STATUS_LABELS_EN[s]}</option>
          ))}
        </select>
      </Field>
      {err ? <p style={{ color: "#f87171", fontSize: 12, margin: "8px 0" }}>{err}</p> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={onClose} style={cancelBtnStyle}>{copy.cancel}</button>
        <button onClick={submit} disabled={submitting} style={primaryBtnStyle}>
          {submitting ? copy.saving : copy.save}
        </button>
      </div>
    </DialogShell>
  );
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: 20, width: 380, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          <button onClick={onClose} style={closeBtnStyle}><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  color: "rgba(255,255,255,0.8)",
  cursor: "pointer",
};

const closeBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 24, height: 24,
  background: "transparent", border: "none",
  color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0,
};

const chipStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center",
  padding: "2px 8px",
  background: `${color}22`,
  border: `1px solid ${color}55`,
  borderRadius: 10,
  fontSize: 11, color,
});

const tagStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center",
  padding: "2px 6px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  fontSize: 11, color: "rgba(255,255,255,0.6)",
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "6px 12px",
  background: "rgba(99,102,241,0.2)",
  border: "1px solid rgba(99,102,241,0.4)",
  borderRadius: 4,
  color: "#a5b4fc", cursor: "pointer", fontSize: 12,
};

const dangerBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "6px 12px",
  background: "rgba(239,68,68,0.15)",
  border: "1px solid rgba(239,68,68,0.4)",
  borderRadius: 4,
  color: "#fca5a5", cursor: "pointer", fontSize: 12,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  color: "inherit", fontSize: 13, boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical", fontFamily: "inherit" };

type GraphCopy = {
  loading: string; loadFailed: string; retry: string; empty: string;
  searchPlaceholder: string; showDeprecated: string; newRelationship: string;
  zoomIn: string; zoomOut: string; resetView: string;
  hintSelect: string; noSummary: string; updated: string;
  edit: string; deprecate: string; editRelationship: string;
  source: string; target: string; relType: string; relStatus: string;
  summary: string; canonStatus: string;
  selectNode: string; selectBoth: string; selfRefError: string;
  cancel: string; create: string; creating: string; save: string; saving: string;
};

function getGraphCopy(isZh: boolean): GraphCopy {
  if (isZh) {
    return {
      loading: "正在加载角色关系图…", loadFailed: "加载失败", retry: "重试",
      empty: "暂无角色。在资产页创建角色后，关系图会在这里展开。",
      searchPlaceholder: "搜索角色…", showDeprecated: "显示废弃", newRelationship: "新建关系",
      zoomIn: "放大", zoomOut: "缩小", resetView: "重置视图",
      hintSelect: "点击节点或关系查看详情。", noSummary: "暂无摘要。", updated: "更新",
      edit: "编辑", deprecate: "废弃", editRelationship: "编辑关系",
      source: "起点", target: "终点", relType: "关系类型", relStatus: "关系状态",
      summary: "摘要", canonStatus: "Canon 状态",
      selectNode: "选择角色", selectBoth: "请选择起点和终点", selfRefError: "起点和终点不能相同",
      cancel: "取消", create: "创建", creating: "创建中…", save: "保存", saving: "保存中…",
    };
  }
  return {
    loading: "Loading character graph…", loadFailed: "Load failed", retry: "Retry",
    empty: "No characters yet. Create characters in Assets tab and the graph will unfold here.",
    searchPlaceholder: "Search characters…", showDeprecated: "Show deprecated", newRelationship: "New relationship",
    zoomIn: "Zoom in", zoomOut: "Zoom out", resetView: "Reset view",
    hintSelect: "Click a node or edge to see details.", noSummary: "No summary.", updated: "Updated",
    edit: "Edit", deprecate: "Deprecate", editRelationship: "Edit relationship",
    source: "Source", target: "Target", relType: "Type", relStatus: "Status",
    summary: "Summary", canonStatus: "Canon status",
    selectNode: "Select character", selectBoth: "Please select both source and target", selfRefError: "Source and target cannot be the same",
    cancel: "Cancel", create: "Create", creating: "Creating…", save: "Save", saving: "Saving…",
  };
}
