"use client";

/** 分镜无限画布：镜头内容实时来自 scenes/frames，画布只保存布局元数据。 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { StoryboardScene } from "@/lib/storyboard/contracts";
import { downloadBlob } from "@/lib/client/download";
import { fitViewport, getCanvasBounds, layoutShotsByScene, normalizeStoryboardCanvas } from "@/lib/production/storyboard-canvas";
import type { StoryboardCanvasEdge, StoryboardCanvasGroup, StoryboardCanvasState } from "@/lib/production/types";

const CARD_W = 150;
const CARD_H = 220;
const GRID_GAP = 24;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
type FrameMap = Record<string, { imageUrl: string }>;
type Point = { x: number; y: number };
type CanvasId = `shot:${string}` | `note:${string}` | `group:${string}`;
type DragState =
  | { kind: "pan"; start: Point; origin: Point }
  | { kind: "items"; start: Point; origins: Record<string, Point>; ids: CanvasId[] }
  | { kind: "marquee"; start: Point; current: Point };
type ContextMenuState = { x: number; y: number; target: CanvasId | null };

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function canvasId(kind: "shot" | "note" | "group", id: string): CanvasId {
  return `${kind}:${id}` as CanvasId;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.matches("input, textarea, select, [contenteditable='true']") || Boolean(target.closest("input, textarea, select, [contenteditable='true']")));
}

function downloadFile(name: string, content: BlobPart, type: string): void {
  downloadBlob(new Blob([content], { type }), name);
}

function objectPosition(state: StoryboardCanvasState, id: CanvasId): Point | null {
  const [kind, value] = id.split(":");
  if (kind === "shot") {
    const shot = state.shots.find((item) => item.shotId === value);
    return shot ? { x: shot.x, y: shot.y } : null;
  }
  if (kind === "note") {
    const note = state.notes.find((item) => item.id === value);
    return note ? { x: note.x, y: note.y } : null;
  }
  const group = state.groups?.find((item) => item.id === value);
  return group ? { x: group.x, y: group.y } : null;
}

function objectRect(state: StoryboardCanvasState, id: CanvasId): { x: number; y: number; width: number; height: number } | null {
  const [kind, value] = id.split(":");
  if (kind === "shot") {
    const shot = state.shots.find((item) => item.shotId === value);
    return shot ? { x: shot.x, y: shot.y, width: CARD_W, height: CARD_H } : null;
  }
  if (kind === "note") {
    const note = state.notes.find((item) => item.id === value);
    return note ? { x: note.x, y: note.y, width: 200, height: 120 } : null;
  }
  const group = state.groups?.find((item) => item.id === value);
  return group ? { x: group.x, y: group.y, width: group.width, height: group.height } : null;
}

function rectsIntersect(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function StoryboardCanvas(props: {
  scenes: StoryboardScene[];
  frames: FrameMap;
  canvas: StoryboardCanvasState | null;
  onChange: (next: StoryboardCanvasState) => void;
  onOpenShot?: (shotId: string) => void;
}) {
  const { scenes, frames, canvas, onChange, onOpenShot } = props;
  const state = useMemo(() => normalizeStoryboardCanvas(canvas), [canvas]);
  const stateRef = useRef(state);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingStateRef = useRef<StoryboardCanvasState | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<CanvasId>>(new Set());
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => () => { if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current); }, []);
  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: PointerEvent) => {
      if (!boardRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu]);

  const commit = useCallback((next: StoryboardCanvasState) => {
    stateRef.current = next;
    onChange(next);
  }, [onChange]);
  const update = useCallback((patch: Partial<StoryboardCanvasState>) => {
    commit({ ...stateRef.current, ...patch, schemaVersion: 2 });
  }, [commit]);
  const schedulePointerUpdate = useCallback((next: StoryboardCanvasState) => {
    pendingStateRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingStateRef.current;
      pendingStateRef.current = null;
      if (pending) commit(pending);
    });
  }, [commit]);

  const allShots = useMemo(() => scenes.flatMap((scene) => scene.shots.map((shot) => ({ scene, shot, shotId: String(shot.id ?? shot.clientId ?? "") }))), [scenes]);
  const shotById = useMemo(() => new Map(allShots.map((entry) => [entry.shotId, entry])), [allShots]);
  const localPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = boardRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);
  const worldPoint = useCallback((point: Point, viewport = stateRef.current.viewport): Point => ({ x: (point.x - viewport.x) / (viewport.zoom || 1), y: (point.y - viewport.y) / (viewport.zoom || 1) }), []);

  const sceneMeta = useCallback(() => allShots.map((entry) => ({ shotId: entry.shotId, sceneOrder: Number(entry.scene.order ?? 0), shotOrder: Number(entry.shot.order ?? 0) })), [allShots]);
  const layoutAllShots = useCallback(() => {
    const existing = new Set(stateRef.current.shots.map((item) => item.shotId));
    const additions = allShots.filter((entry) => entry.shotId && !existing.has(entry.shotId)).map((entry, index) => ({ shotId: entry.shotId, x: (index % 5) * (CARD_W + GRID_GAP), y: Math.floor(index / 5) * (CARD_H + GRID_GAP) }));
    if (additions.length) update({ shots: layoutShotsByScene([...stateRef.current.shots, ...additions], sceneMeta()) });
  }, [allShots, sceneMeta, update]);
  const layoutByScene = useCallback(() => {
    if (stateRef.current.shots.length) update({ shots: layoutShotsByScene(stateRef.current.shots, sceneMeta()) });
  }, [sceneMeta, update]);
  const addNote = useCallback(() => {
    const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const center = worldPoint({ x: (boardRef.current?.clientWidth ?? 720) / 2, y: (boardRef.current?.clientHeight ?? 420) / 2 });
    update({ notes: [...stateRef.current.notes, { id, text: "", x: Math.round(center.x - 100), y: Math.round(center.y - 60) }] });
    setSelectedIds(new Set([canvasId("note", id)]));
    setEditingNoteId(id);
  }, [update, worldPoint]);
  const handleFitView = useCallback(() => {
    const board = boardRef.current;
    if (board) update({ viewport: fitViewport(getCanvasBounds(stateRef.current), board.clientWidth, board.clientHeight) });
  }, [update]);
  const zoomAtPoint = useCallback((point: Point, factor: number) => {
    const viewport = stateRef.current.viewport;
    const nextZoom = clampZoom(viewport.zoom * factor);
    const world = worldPoint(point, viewport);
    update({ viewport: { x: point.x - world.x * nextZoom, y: point.y - world.y * nextZoom, zoom: nextZoom } });
  }, [update, worldPoint]);
  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomAtPoint(localPoint(event), event.deltaY < 0 ? 1.1 : 0.9);
  }, [localPoint, zoomAtPoint]);

  const handleBackgroundPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    setContextMenu(null);
    const point = localPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.shiftKey) {
      dragRef.current = { kind: "marquee", start: point, current: point };
      setMarquee({ start: point, current: point });
    } else {
      dragRef.current = { kind: "pan", start: point, origin: { x: stateRef.current.viewport.x, y: stateRef.current.viewport.y } };
    }
  }, [localPoint]);

  const beginItemDrag = useCallback((event: ReactPointerEvent, kind: "shot" | "note" | "group", id: string, x: number, y: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const itemId = canvasId(kind, id);
    const nextSelection = event.shiftKey ? new Set(selectedIds).add(itemId) : selectedIds.has(itemId) ? selectedIds : new Set([itemId]);
    setSelectedIds(nextSelection);
    const ids = [...nextSelection];
    const origins = Object.fromEntries(ids.map((selectedId) => [selectedId, objectPosition(stateRef.current, selectedId) ?? { x, y }])) as Record<string, Point>;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { kind: "items", start: localPoint(event), origins, ids };
  }, [localPoint, selectedIds]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = localPoint(event);
    if (drag.kind === "marquee") {
      drag.current = point;
      setMarquee({ start: drag.start, current: point });
      return;
    }
    if (drag.kind === "pan") {
      schedulePointerUpdate({ ...stateRef.current, viewport: { ...stateRef.current.viewport, x: drag.origin.x + point.x - drag.start.x, y: drag.origin.y + point.y - drag.start.y } });
      return;
    }
    const dx = (point.x - drag.start.x) / (stateRef.current.viewport.zoom || 1);
    const dy = (point.y - drag.start.y) / (stateRef.current.viewport.zoom || 1);
    const positions = new Map(drag.ids.map((id) => [id, { x: Math.round((drag.origins[id]?.x ?? 0) + dx), y: Math.round((drag.origins[id]?.y ?? 0) + dy) }]));
    schedulePointerUpdate({ ...stateRef.current, shots: stateRef.current.shots.map((item) => positions.has(canvasId("shot", item.shotId)) ? { ...item, ...positions.get(canvasId("shot", item.shotId)) } : item), notes: stateRef.current.notes.map((item) => positions.has(canvasId("note", item.id)) ? { ...item, ...positions.get(canvasId("note", item.id)) } : item), groups: (stateRef.current.groups ?? []).map((item) => positions.has(canvasId("group", item.id)) ? { ...item, ...positions.get(canvasId("group", item.id)) } : item) });
  }, [localPoint, schedulePointerUpdate]);

  const removeIds = useCallback((ids: Iterable<CanvasId>) => {
    const removed = new Set(ids);
    if (!removed.size) return;
    update({ shots: stateRef.current.shots.filter((item) => !removed.has(canvasId("shot", item.shotId))), notes: stateRef.current.notes.filter((item) => !removed.has(canvasId("note", item.id))), groups: (stateRef.current.groups ?? []).filter((item) => !removed.has(canvasId("group", item.id))), edges: (stateRef.current.edges ?? []).filter((edge) => !removed.has(edge.from as CanvasId) && !removed.has(edge.to as CanvasId)) });
    setSelectedIds((current) => new Set([...current].filter((id) => !removed.has(id))));
  }, [update]);
  const removeSelected = useCallback(() => removeIds(selectedIds), [removeIds, selectedIds]);
  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.kind === "marquee") {
      const topLeft = worldPoint({ x: Math.min(drag.start.x, drag.current.x), y: Math.min(drag.start.y, drag.current.y) });
      const selectionRect = { x: topLeft.x, y: topLeft.y, width: Math.abs(drag.current.x - drag.start.x) / stateRef.current.viewport.zoom, height: Math.abs(drag.current.y - drag.start.y) / stateRef.current.viewport.zoom };
      const next = new Set<CanvasId>();
      for (const item of stateRef.current.shots) if (rectsIntersect(selectionRect, { x: item.x, y: item.y, width: CARD_W, height: CARD_H })) next.add(canvasId("shot", item.shotId));
      for (const item of stateRef.current.notes) if (rectsIntersect(selectionRect, { x: item.x, y: item.y, width: 200, height: 120 })) next.add(canvasId("note", item.id));
      setSelectedIds(next);
    }
    dragRef.current = null;
    setMarquee(null);
  }, [worldPoint]);
  const addGroup = useCallback(() => {
    const rects = [...selectedIds].map((id) => objectRect(stateRef.current, id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!rects.length) return;
    const minX = Math.min(...rects.map((item) => item.x)) - 24;
    const minY = Math.min(...rects.map((item) => item.y)) - 42;
    const maxX = Math.max(...rects.map((item) => item.x + item.width)) + 24;
    const maxY = Math.max(...rects.map((item) => item.y + item.height)) + 24;
    const group: StoryboardCanvasGroup = { id: `group-${Date.now()}`, title: "新分组", x: minX, y: minY, width: maxX - minX, height: maxY - minY, color: "#75dbc6", members: [...selectedIds] };
    update({ groups: [...(stateRef.current.groups ?? []), group] });
    setSelectedIds(new Set([canvasId("group", group.id)]));
  }, [selectedIds, update]);
  const connectSelected = useCallback(() => {
    const ids = [...selectedIds].filter((id) => id.startsWith("shot:") || id.startsWith("note:"));
    if (ids.length < 2) return;
    const edge: StoryboardCanvasEdge = { id: `edge-${Date.now()}`, from: ids[0], to: ids[1], label: "" };
    update({ edges: [...(stateRef.current.edges ?? []), edge] });
  }, [selectedIds, update]);
  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const targetElement = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-canvas-id]") : null;
    const target = (targetElement?.dataset.canvasId as CanvasId | undefined) ?? null;
    if (target && !event.shiftKey) setSelectedIds(new Set([target]));
    const point = localPoint(event);
    const board = boardRef.current;
    const menuWidth = 220;
    const menuHeight = 300;
    setContextMenu({
      x: Math.max(8, Math.min(point.x, (board?.clientWidth ?? 720) - menuWidth - 8)),
      y: Math.max(8, Math.min(point.y, (board?.clientHeight ?? 420) - menuHeight - 8)),
      target,
    });
  }, [localPoint]);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const removeContextTarget = useCallback(() => {
    if (contextMenu?.target) removeIds([contextMenu.target]);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.target, removeIds]);
  const openContextShot = useCallback(() => {
    const target = contextMenu?.target;
    if (target?.startsWith("shot:")) onOpenShot?.(target.slice("shot:".length));
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.target, onOpenShot]);
  const editContextNote = useCallback(() => {
    const target = contextMenu?.target;
    if (target?.startsWith("note:")) setEditingNoteId(target.slice("note:".length));
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.target]);
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target)) return;
    if (event.key === "Escape") { setSelectedIds(new Set()); setContextMenu(null); }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelected(); }
  }, [removeSelected]);
  const exportLayout = useCallback(() => {
    downloadFile("storyboard-canvas-layout.json", JSON.stringify({ kind: "kiikis-storyboard-canvas-layout", label: "画布布局与导演备注", canvas: normalizeStoryboardCanvas(stateRef.current) }, null, 2), "application/json");
  }, []);
  const exportSnapshot = useCallback(() => {
    const bounds = getCanvasBounds(stateRef.current) ?? { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    const scale = Math.min(1, 1200 / Math.max(1, bounds.maxX - bounds.minX), 800 / Math.max(1, bounds.maxY - bounds.minY));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round((bounds.maxX - bounds.minX) * scale));
    output.height = Math.max(1, Math.round((bounds.maxY - bounds.minY) * scale));
    const context = output.getContext("2d");
    if (!context) return;
    context.fillStyle = "#101617";
    context.fillRect(0, 0, output.width, output.height);
    context.font = "14px sans-serif";
    const draw = (x: number, y: number, width: number, height: number, label: string, fill: string) => { context.fillStyle = fill; context.fillRect((x - bounds.minX) * scale, (y - bounds.minY) * scale, width * scale, height * scale); context.fillStyle = "#e8f2f0"; context.fillText(label, (x - bounds.minX + 10) * scale, (y - bounds.minY + 24) * scale); };
    for (const group of stateRef.current.groups ?? []) draw(group.x, group.y, group.width, group.height, group.title, "rgba(117,219,198,.12)");
    for (const item of stateRef.current.shots) draw(item.x, item.y, CARD_W, CARD_H, `镜头 ${shotById.get(item.shotId)?.shot.order ?? "已失效"}`, "#233634");
    for (const item of stateRef.current.notes) draw(item.x, item.y, 200, 120, item.text || "导演便签", "#544d2c");
    output.toBlob((blob) => { if (blob) downloadFile("storyboard-canvas.png", blob, "image/png"); });
  }, [shotById]);

  const viewport = state.viewport;
  const marqueeStyle = marquee ? { left: Math.min(marquee.start.x, marquee.current.x), top: Math.min(marquee.start.y, marquee.current.y), width: Math.abs(marquee.current.x - marquee.start.x), height: Math.abs(marquee.current.y - marquee.start.y) } : null;
  const contextTargetKind = contextMenu?.target?.split(":")[0];
  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 420 }} data-testid="storyboard-canvas">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <strong style={{ fontSize: 14 }}>分镜画布</strong><span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{state.shots.length} 镜头 · {state.notes.length} 便签 · {Math.round(viewport.zoom * 100)}%</span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          <button type="button" data-testid="canvas-layout-all" onClick={layoutAllShots} style={buttonStyle(true)}>全部镜头上画布</button>
          <button type="button" onClick={layoutByScene} style={buttonStyle(false)}>按场次排版</button>
          <button type="button" data-testid="canvas-add-note" onClick={addNote} style={buttonStyle(false)}>添加便签</button>
          <button type="button" onClick={addGroup} disabled={!selectedIds.size} style={buttonStyle(false)}>分组</button>
          <button type="button" onClick={connectSelected} disabled={selectedIds.size < 2} style={buttonStyle(false)}>连线</button>
          <button type="button" data-testid="canvas-fit-view" onClick={handleFitView} style={buttonStyle(false)}>适配视图</button>
          <button type="button" onClick={() => zoomAtPoint({ x: (boardRef.current?.clientWidth ?? 720) / 2, y: (boardRef.current?.clientHeight ?? 420) / 2 }, 1 / 1.2)} style={buttonStyle(false)}>−</button>
          <button type="button" onClick={() => zoomAtPoint({ x: (boardRef.current?.clientWidth ?? 720) / 2, y: (boardRef.current?.clientHeight ?? 420) / 2 }, 1.2)} style={buttonStyle(false)}>＋</button>
          <button type="button" onClick={() => update({ viewport: { x: 0, y: 0, zoom: 1 } })} style={buttonStyle(false)}>重置视图</button>
          <button type="button" onClick={exportSnapshot} style={buttonStyle(false)}>导出画布</button>
          <button type="button" onClick={exportLayout} style={buttonStyle(false)}>导出布局 JSON</button>
        </div>
      </div>
      <div ref={boardRef} tabIndex={0} title="Shift+拖拽框选" onKeyDown={handleKeyDown} onContextMenu={handleContextMenu} onPointerDown={handleBackgroundPointerDown} onPointerMove={handlePointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} onWheel={handleWheel} style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", outline: "none", background: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.07) 1px, transparent 0) 0 0 / 26px 26px, rgba(255,255,255,.015)", cursor: dragRef.current?.kind === "pan" ? "grabbing" : "grab", touchAction: "none" }}>
        <div data-testid="canvas-world-layer" style={{ position: "absolute", left: 0, top: 0, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: "0 0", width: 1, height: 1 }}>
          <svg aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
            {(state.edges ?? []).map((edge) => { const from = objectRect(state, edge.from as CanvasId); const to = objectRect(state, edge.to as CanvasId); return from && to ? <line key={edge.id} x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} stroke={edge.color || "#75dbc6"} strokeWidth="2" markerEnd="url(#canvas-arrow)" /> : null; })}
            <defs><marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#75dbc6" /></marker></defs>
          </svg>
          {(state.groups ?? []).map((group) => <div key={`group-${group.id}`} data-canvas-id={canvasId("group", group.id)} onPointerDown={(event) => beginItemDrag(event, "group", group.id, group.x, group.y)} style={{ position: "absolute", left: group.x, top: group.y, width: group.width, height: group.height, border: `1px solid ${group.color || "rgba(117,219,198,.45)"}`, background: "rgba(117,219,198,.06)", borderRadius: 14, color: "var(--ink-muted)", padding: "8px 12px", fontSize: 12, boxSizing: "border-box", zIndex: 1, ...(selectedIds.has(canvasId("group", group.id)) ? { boxShadow: "0 0 0 2px rgba(117,219,198,.5)" } : {}) }}>{group.title}</div>)}
          {state.shots.map((item) => { const entry = shotById.get(item.shotId); const imageUrl = entry ? frames[entry.shotId]?.imageUrl : undefined; const id = canvasId("shot", item.shotId); return <div key={`shot-${item.shotId}`} data-canvas-id={id} onPointerDown={(event) => beginItemDrag(event, "shot", item.shotId, item.x, item.y)} style={{ position: "absolute", left: item.x, top: item.y, width: CARD_W, borderRadius: 10, border: selectedIds.has(id) ? "2px solid #75dbc6" : "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", overflow: "hidden", cursor: "grab", userSelect: "none", touchAction: "none", zIndex: 2 }}><div style={{ aspectRatio: "9 / 16", background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>{imageUrl ? <img src={imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /> : <span style={{ fontSize: 12, color: "var(--ink-muted)", padding: 12, textAlign: "center" }}>{entry ? "未生成" : "镜头已删除"}</span>}</div><div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", fontSize: 12 }}><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => entry && onOpenShot?.(item.shotId)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", color: entry ? "inherit" : "var(--ink-muted)", cursor: entry ? "pointer" : "default", padding: 0 }}>{entry ? `场 ${entry.scene.order} · 镜 ${entry.shot.order}` : "已失效"}</button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setSelectedIds(new Set([id])); removeIds([id]); }} aria-label="移出画布" style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", padding: 2 }}>✕</button></div></div>; })}
          {state.notes.map((note) => { const id = canvasId("note", note.id); return <div key={`note-${note.id}`} data-canvas-id={id} onPointerDown={(event) => beginItemDrag(event, "note", note.id, note.x, note.y)} style={{ position: "absolute", left: note.x, top: note.y, width: 200, minHeight: 120, borderRadius: 10, border: selectedIds.has(id) ? "2px solid #ffd166" : "1px solid rgba(255,209,102,.35)", background: "rgba(255,209,102,.08)", padding: 10, cursor: "grab", userSelect: "none", touchAction: "none", zIndex: 3, boxSizing: "border-box" }}>{editingNoteId === note.id ? <textarea autoFocus defaultValue={note.text} onPointerDown={(event) => event.stopPropagation()} onBlur={(event) => { update({ notes: stateRef.current.notes.map((item) => item.id === note.id ? { ...item, text: event.target.value } : item) }); setEditingNoteId(null); }} placeholder="记录导演备注…" style={{ width: "100%", minHeight: 80, resize: "vertical", background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 12.5, fontFamily: "inherit" }} /> : <div onPointerDown={(event) => event.stopPropagation()} onClick={() => setEditingNoteId(note.id)} style={{ minHeight: 80, fontSize: 12.5, whiteSpace: "pre-wrap", color: note.text ? "inherit" : "var(--ink-muted)" }}>{note.text || "点击输入便签内容…"}</div>}<button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => removeIds([id])} aria-label="删除便签" style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", padding: 2 }}>✕</button></div>; })}
        </div>
        {marqueeStyle ? <div style={{ position: "absolute", ...marqueeStyle, border: "1px solid #75dbc6", background: "rgba(117,219,198,.12)", pointerEvents: "none" }} /> : null}
        {state.shots.length === 0 && state.notes.length === 0 && !(state.groups ?? []).length ? <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-muted)", fontSize: 13, pointerEvents: "none" }}>用“全部镜头”或“添加便签”开始</div> : null}
        {contextMenu ? (
          <div data-testid="canvas-context-menu" role="menu" aria-label="画布上下文菜单" onPointerDown={(event) => event.stopPropagation()} style={{ position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 20, width: 220, padding: 6, border: "1px solid rgba(117,219,198,.35)", borderRadius: 10, background: "rgba(18,24,25,.98)", boxShadow: "0 14px 36px rgba(0,0,0,.35)" }}>
            {contextTargetKind === "shot" ? <ContextMenuButton label="打开镜头" onClick={openContextShot} /> : null}
            {contextTargetKind === "note" ? <ContextMenuButton label="编辑便签" onClick={editContextNote} /> : null}
            {contextMenu.target ? <ContextMenuButton label={contextTargetKind === "note" ? "删除便签" : contextTargetKind === "group" ? "删除分组" : "移出镜头"} onClick={removeContextTarget} danger /> : null}
            {!contextMenu.target ? <>
              <ContextMenuButton label="添加便签" onClick={() => { addNote(); closeContextMenu(); }} />
              <ContextMenuButton label="全部镜头上画布" onClick={() => { layoutAllShots(); closeContextMenu(); }} />
              <ContextMenuButton label="按场次排版" onClick={() => { layoutByScene(); closeContextMenu(); }} />
              <ContextMenuButton label="适配视图" onClick={() => { handleFitView(); closeContextMenu(); }} />
            </> : null}
            {selectedIds.size ? <>
              <div style={{ height: 1, margin: "5px 4px", background: "rgba(255,255,255,.1)" }} />
              <ContextMenuButton label="分组" onClick={() => { addGroup(); closeContextMenu(); }} />
              <ContextMenuButton label="连线" onClick={() => { connectSelected(); closeContextMenu(); }} disabled={selectedIds.size < 2} />
              <ContextMenuButton label="删除所选" onClick={() => { removeSelected(); closeContextMenu(); }} danger />
              <ContextMenuButton label="清除选择" onClick={() => { setSelectedIds(new Set()); closeContextMenu(); }} />
            </> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ContextMenuButton({ label, onClick, disabled = false, danger = false }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" role="menuitem" onClick={onClick} disabled={disabled} style={{ display: "block", width: "100%", padding: "8px 10px", border: 0, borderRadius: 7, background: "transparent", color: danger ? "#ff8d8d" : "var(--ink-primary)", textAlign: "left", fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .45 : 1 }}>{label}</button>;
}

function buttonStyle(primary: boolean): CSSProperties {
  return { padding: "6px 10px", borderRadius: 8, border: primary ? "1px solid rgba(117,219,198,.5)" : "1px solid rgba(255,255,255,.15)", background: primary ? "rgba(117,219,198,.12)" : "transparent", color: primary ? "#75dbc6" : "inherit", fontWeight: primary ? 700 : 400, fontSize: 12, cursor: "pointer" };
}
