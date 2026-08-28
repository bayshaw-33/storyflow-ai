import type {
  StoryboardCanvasEdge,
  StoryboardCanvasGroup,
  StoryboardCanvasNote,
  StoryboardCanvasShotRef,
  StoryboardCanvasState,
  StoryboardCanvasViewport,
} from "./types";

export type CanvasBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type CanvasShotMeta = { shotId: string; sceneOrder: number; shotOrder: number };
export type CanvasObjectSizes = { shotWidth?: number; shotHeight?: number; noteWidth?: number; noteHeight?: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const DEFAULT_SHOT_WIDTH = 150;
const DEFAULT_SHOT_HEIGHT = 220;
const DEFAULT_NOTE_WIDTH = 200;
const DEFAULT_NOTE_HEIGHT = 200;
const GRID_GAP = 24;

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeZoom(value: unknown): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finiteNumber(value, 1)));
}

function normalizeShot(item: StoryboardCanvasShotRef): StoryboardCanvasShotRef | null {
  if (!item || typeof item.shotId !== "string" || !item.shotId) return null;
  return { shotId: item.shotId, x: finiteNumber(item.x), y: finiteNumber(item.y) };
}

function normalizeNote(item: StoryboardCanvasNote): StoryboardCanvasNote | null {
  if (!item || typeof item.id !== "string" || !item.id) return null;
  return { id: item.id, text: typeof item.text === "string" ? item.text : "", x: finiteNumber(item.x), y: finiteNumber(item.y) };
}

function normalizeGroup(item: StoryboardCanvasGroup): StoryboardCanvasGroup | null {
  if (!item || typeof item.id !== "string" || !item.id) return null;
  return {
    id: item.id,
    title: typeof item.title === "string" ? item.title : "未命名分组",
    x: finiteNumber(item.x),
    y: finiteNumber(item.y),
    width: Math.max(80, finiteNumber(item.width, 240)),
    height: Math.max(60, finiteNumber(item.height, 180)),
    ...(typeof item.color === "string" ? { color: item.color } : {}),
    ...(Array.isArray(item.members) ? { members: item.members.filter((member): member is string => typeof member === "string") } : {}),
  };
}

function normalizeEdge(item: StoryboardCanvasEdge): StoryboardCanvasEdge | null {
  if (!item || typeof item.id !== "string" || !item.id || typeof item.from !== "string" || typeof item.to !== "string") return null;
  return {
    id: item.id,
    from: item.from,
    to: item.to,
    ...(typeof item.label === "string" ? { label: item.label } : {}),
    ...(typeof item.color === "string" ? { color: item.color } : {}),
  };
}

export function normalizeStoryboardCanvas(value: StoryboardCanvasState | null | undefined): StoryboardCanvasState {
  const input = value ?? { viewport: { x: 0, y: 0, zoom: 1 }, shots: [], notes: [] };
  const shots: StoryboardCanvasShotRef[] = [];
  const shotIds = new Set<string>();
  for (const item of Array.isArray(input.shots) ? input.shots : []) {
    const normalized = normalizeShot(item);
    if (normalized && !shotIds.has(normalized.shotId)) {
      shotIds.add(normalized.shotId);
      shots.push(normalized);
    }
  }
  const notes = (Array.isArray(input.notes) ? input.notes : []).map(normalizeNote).filter((item): item is StoryboardCanvasNote => Boolean(item));
  const groups = (Array.isArray(input.groups) ? input.groups : []).map(normalizeGroup).filter((item): item is StoryboardCanvasGroup => Boolean(item));
  const edges = (Array.isArray(input.edges) ? input.edges : []).map(normalizeEdge).filter((item): item is StoryboardCanvasEdge => Boolean(item));
  return {
    schemaVersion: 2,
    viewport: {
      x: finiteNumber(input.viewport?.x),
      y: finiteNumber(input.viewport?.y),
      zoom: safeZoom(input.viewport?.zoom),
    },
    shots,
    notes,
    groups,
    edges,
  };
}

export function getCanvasBounds(state: StoryboardCanvasState, sizes: CanvasObjectSizes = {}): CanvasBounds | null {
  const normalized = normalizeStoryboardCanvas(state);
  const shotWidth = sizes.shotWidth ?? DEFAULT_SHOT_WIDTH;
  const shotHeight = sizes.shotHeight ?? DEFAULT_SHOT_HEIGHT;
  const noteWidth = sizes.noteWidth ?? DEFAULT_NOTE_WIDTH;
  const noteHeight = sizes.noteHeight ?? DEFAULT_NOTE_HEIGHT;
  const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [
    ...normalized.shots.map((item) => ({ x: item.x, y: item.y, width: shotWidth, height: shotHeight })),
    ...normalized.notes.map((item) => ({ x: item.x, y: item.y, width: noteWidth, height: noteHeight })),
    ...(normalized.groups ?? []).map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height })),
  ];
  if (!rectangles.length) return null;
  return rectangles.reduce<CanvasBounds>(
    (bounds, item) => ({
      minX: Math.min(bounds.minX, item.x),
      minY: Math.min(bounds.minY, item.y),
      maxX: Math.max(bounds.maxX, item.x + item.width),
      maxY: Math.max(bounds.maxY, item.y + item.height),
    }),
    { minX: rectangles[0].x, minY: rectangles[0].y, maxX: rectangles[0].x + rectangles[0].width, maxY: rectangles[0].y + rectangles[0].height },
  );
}

export function layoutShotsByScene(shots: StoryboardCanvasShotRef[], shotMeta: CanvasShotMeta[]): StoryboardCanvasShotRef[] {
  const metadata = new Map(shotMeta.map((item) => [item.shotId, item]));
  return [...shots]
    .sort((a, b) => {
      const left = metadata.get(a.shotId) ?? { sceneOrder: Number.MAX_SAFE_INTEGER, shotOrder: Number.MAX_SAFE_INTEGER };
      const right = metadata.get(b.shotId) ?? { sceneOrder: Number.MAX_SAFE_INTEGER, shotOrder: Number.MAX_SAFE_INTEGER };
      return left.sceneOrder - right.sceneOrder || left.shotOrder - right.shotOrder || a.shotId.localeCompare(b.shotId);
    })
    .map((item, index) => ({ ...item, x: (index % 5) * (DEFAULT_SHOT_WIDTH + GRID_GAP), y: Math.floor(index / 5) * (DEFAULT_SHOT_HEIGHT + GRID_GAP) }));
}

export function fitViewport(bounds: CanvasBounds | null, viewportWidth: number, viewportHeight: number): StoryboardCanvasViewport {
  if (!bounds || viewportWidth <= 0 || viewportHeight <= 0) return { x: 0, y: 0, zoom: 1 };
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = Math.min(1, MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(viewportWidth / width, viewportHeight / height)));
  return {
    x: Math.round((viewportWidth - width * zoom) / 2 - bounds.minX * zoom),
    y: Math.round((viewportHeight - height * zoom) / 2 - bounds.minY * zoom),
    zoom,
  };
}
