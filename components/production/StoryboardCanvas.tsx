"use client";

/**
 * 分镜自由排布画布（第五子视图：画布）。
 *
 * 形态：Figma/Miro 风格 —— 镜头卡 + 文字便签自由拖放，背景拖拽平移、
 * 滚轮缩放；"全部镜头"一键把当前分镜铺到画布网格。
 * 数据：镜头卡只存 shotId+坐标（展示实时取自 scenes/frames，镜头删除后
 * 降级为占位）；便签内容为画布自有。整体状态经 onChange 上抛，由
 * ProductionWorkbench 走现有分镜草稿管线持久化（本地 + 云端同字段）。
 */

import { useCallback, useRef, useState } from "react";
import type { StoryboardScene } from "@/lib/storyboard/contracts";
import type { StoryboardCanvasState } from "@/lib/production/types";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const CARD_W = 150;
const CARD_H = 220;
const GRID_GAP = 24;

type FrameMap = Record<string, { imageUrl: string }>;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function emptyCanvas(): StoryboardCanvasState {
  return { viewport: { x: 0, y: 0, zoom: 1 }, shots: [], notes: [] };
}

export function StoryboardCanvas(props: {
  scenes: StoryboardScene[];
  frames: FrameMap;
  canvas: StoryboardCanvasState | null;
  onChange: (next: StoryboardCanvasState) => void;
}) {
  const { scenes, frames, canvas, onChange } = props;
  const state = canvas ?? emptyCanvas();

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const dragRef = useRef<
    | { kind: "pan"; startX: number; startY: number; originX: number; originY: number }
    | { kind: "shot"; shotId: string; startX: number; startY: number; originX: number; originY: number }
    | { kind: "note"; noteId: string; startX: number; startY: number; originX: number; originY: number }
    | null
  >(null);

  const allShots = scenes.flatMap((scene) =>
    scene.shots.map((shot) => ({ scene, shot, shotId: String(shot.id ?? shot.clientId ?? "") })),
  );
  const shotById = new Map(allShots.map((entry) => [entry.shotId, entry]));

  const update = useCallback(
    (patch: Partial<StoryboardCanvasState>) => onChange({ ...state, ...patch }),
    [state, onChange],
  );

  /** 一键铺场：把所有尚未上画布的镜头按网格排布。 */
  const layoutAllShots = useCallback(() => {
    const existing = new Set(state.shots.map((item) => item.shotId));
    const additions = allShots
      .filter((entry) => entry.shotId && !existing.has(entry.shotId))
      .map((entry, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        return { shotId: entry.shotId, x: column * (CARD_W + GRID_GAP), y: row * (CARD_H + GRID_GAP) };
      });
    if (!additions.length) return;
    update({ shots: [...state.shots, ...additions] });
  }, [state.shots, allShots, update]);

  const addNote = useCallback(() => {
    const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { x: vx, y: vy } = state.viewport;
    // 落在当前视口中心附近（画布坐标）
    const cx = (typeof window === "undefined" ? 600 : window.innerWidth / 2 - vx) / (state.viewport.zoom || 1);
    const cy = (typeof window === "undefined" ? 400 : 360 - vy) / (state.viewport.zoom || 1);
    update({ notes: [...state.notes, { id, text: "", x: Math.round(cx - 90), y: Math.round(cy - 60) }] });
    setEditingNoteId(id);
  }, [state.notes, state.viewport, update]);

  const removeNote = useCallback((noteId: string) => {
    dragRef.current = null;
    onChange({ ...state, notes: state.notes.filter((note) => note.id !== noteId) });
  }, [state, onChange]);

  const removeShot = useCallback((shotId: string) => {
    dragRef.current = null;
    onChange({ ...state, shots: state.shots.filter((item) => item.shotId !== shotId) });
  }, [state, onChange]);

  const handleBackgroundPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        kind: "pan",
        startX: event.clientX,
        startY: event.clientY,
        originX: state.viewport.x,
        originY: state.viewport.y,
      };
    },
    [state.viewport],
  );

  const beginItemDrag = useCallback(
    (event: React.PointerEvent, kind: "shot" | "note", id: string, x: number, y: number) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      dragRef.current = { kind, [`${kind === "shot" ? "shot" : "note"}Id`]: id, startX: event.clientX, startY: event.clientY, originX: x, originY: y } as typeof dragRef.current;
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const zoom = state.viewport.zoom || 1;
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;
      if (drag.kind === "pan") {
        update({ viewport: { ...state.viewport, x: drag.originX + (event.clientX - drag.startX), y: drag.originY + (event.clientY - drag.startY) } });
        return;
      }
      if (drag.kind === "shot") {
        update({ shots: state.shots.map((item) => (item.shotId === drag.shotId ? { ...item, x: Math.round(drag.originX + dx), y: Math.round(drag.originY + dy) } : item)) });
        return;
      }
      update({ notes: state.notes.map((item) => (item.id === drag.noteId ? { ...item, x: Math.round(drag.originX + dx), y: Math.round(drag.originY + dy) } : item)) });
    },
    [state, update],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      update({ viewport: { ...state.viewport, zoom: clampZoom((state.viewport.zoom || 1) * factor) } });
    },
    [state.viewport, update],
  );

  const zoomBy = useCallback(
    (factor: number) => update({ viewport: { ...state.viewport, zoom: clampZoom((state.viewport.zoom || 1) * factor) } }),
    [state.viewport, update],
  );

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 420 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <strong style={{ fontSize: 14 }}>分镜画布</strong>
        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>自由排布镜头与便签，拖拽空白处平移、滚轮缩放；内容随分镜草稿自动保存。</span>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <button type="button" onClick={layoutAllShots} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(117,219,198,.5)", background: "rgba(117,219,198,.12)", color: "#75dbc6", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            全部镜头上画布
          </button>
          <button type="button" onClick={addNote} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer" }}>
            添加便签
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.2)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer" }}>−</button>
          <span style={{ fontSize: 12, color: "var(--ink-muted)", minWidth: 38, textAlign: "center" }}>{Math.round((state.viewport.zoom || 1) * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.2)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer" }}>＋</button>
          <button type="button" onClick={() => update({ viewport: { x: 0, y: 0, zoom: 1 } })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer" }}>
            重置视图
          </button>
        </div>
      </div>

      <div
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          background:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,.07) 1px, transparent 0) 0 0 / 26px 26px, rgba(255,255,255,.015)",
          cursor: dragRef.current?.kind === "pan" ? "grabbing" : "default",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom || 1})`,
            transformOrigin: "0 0",
            width: 0,
            height: 0,
          }}
        >
          {state.shots.map((item) => {
            const entry = shotById.get(item.shotId);
            const imageUrl = entry ? frames[entry.shotId]?.imageUrl : undefined;
            return (
              <div
                key={`shot-${item.shotId}`}
                onPointerDown={(event) => beginItemDrag(event, "shot", item.shotId, item.x, item.y)}
                style={{
                  position: "absolute",
                  left: item.x,
                  top: item.y,
                  width: CARD_W,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.12)",
                  background: "rgba(255,255,255,.04)",
                  overflow: "hidden",
                  cursor: "grab",
                  userSelect: "none",
                  touchAction: "none",
                }}
              >
                <div style={{ aspectRatio: "9 / 16", background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                  ) : (
                    <span style={{ fontSize: 12, color: entry ? "var(--ink-muted)" : "var(--ink-muted)", padding: 12, textAlign: "center" }}>
                      {entry ? "未生成" : "镜头已删除"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", fontSize: 12 }}>
                  <span style={{ flex: 1, color: entry ? "inherit" : "var(--ink-muted)" }}>
                    {entry ? `场 ${entry.scene.order} · 镜 ${entry.shot.order}` : "已失效"}
                  </span>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeShot(item.shotId)}
                    aria-label="移出画布"
                    style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", padding: 2, fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          {state.notes.map((note) => (
            <div
              key={`note-${note.id}`}
              onPointerDown={(event) => beginItemDrag(event, "note", note.id, note.x, note.y)}
              style={{
                position: "absolute",
                left: note.x,
                top: note.y,
                width: 200,
                minHeight: 90,
                borderRadius: 10,
                border: "1px solid rgba(255,209,102,.35)",
                background: "rgba(255,209,102,.08)",
                padding: 10,
                cursor: "grab",
                userSelect: "none",
                touchAction: "none",
              }}
            >
              {editingNoteId === note.id ? (
                <textarea
                  autoFocus
                  defaultValue={note.text}
                  onPointerDown={(event) => event.stopPropagation()}
                  onBlur={(event) => {
                    update({ notes: state.notes.map((item) => (item.id === note.id ? { ...item, text: event.target.value } : item)) });
                    setEditingNoteId(null);
                  }}
                  placeholder="记录构思、节奏、衔接备注…"
                  style={{ width: "100%", minHeight: 70, resize: "vertical", background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 12.5, fontFamily: "inherit" }}
                />
              ) : (
                <div
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setEditingNoteId(note.id)}
                  style={{ minHeight: 70, fontSize: 12.5, whiteSpace: "pre-wrap", color: note.text ? "inherit" : "var(--ink-muted)" }}
                >
                  {note.text || "点击输入便签内容…"}
                </div>
              )}
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => removeNote(note.id)}
                aria-label="删除便签"
                style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", padding: 2, fontSize: 12 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {state.shots.length === 0 && state.notes.length === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--ink-muted)", fontSize: 13, pointerEvents: "none" }}>
            <span>画布还是空的</span>
            <span style={{ fontSize: 12 }}>点击「全部镜头上画布」铺开分镜，或「添加便签」记录构思。</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
