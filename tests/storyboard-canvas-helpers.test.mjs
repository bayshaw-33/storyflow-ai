import assert from "node:assert/strict";
import test from "node:test";

import {
  fitViewport,
  getCanvasBounds,
  layoutShotsByScene,
  normalizeStoryboardCanvas,
} from "../lib/production/storyboard-canvas.ts";

test("normalizeStoryboardCanvas keeps legacy shots and notes while adding safe defaults", () => {
  const state = normalizeStoryboardCanvas({
    viewport: { x: Number.NaN, y: 12, zoom: 99 },
    shots: [
      { shotId: "shot-1", x: 20, y: 30 },
      { shotId: "shot-1", x: 99, y: 99 },
      { shotId: "shot-2", x: Number.POSITIVE_INFINITY, y: -4 },
    ],
    notes: [{ id: "note-1", text: "保留这条备注", x: 40, y: 50 }],
  });

  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.viewport, { x: 0, y: 12, zoom: 4 });
  assert.deepEqual(state.shots, [
    { shotId: "shot-1", x: 20, y: 30 },
    { shotId: "shot-2", x: 0, y: -4 },
  ]);
  assert.equal(state.notes[0].text, "保留这条备注");
  assert.deepEqual(state.groups, []);
  assert.deepEqual(state.edges, []);
});

test("getCanvasBounds includes legacy objects and new groups", () => {
  const bounds = getCanvasBounds({
    viewport: { x: 0, y: 0, zoom: 1 },
    shots: [{ shotId: "shot-1", x: -20, y: 10 }],
    notes: [{ id: "note-1", text: "", x: 100, y: 50 }],
    groups: [{ id: "group-1", title: "第一场", x: 0, y: -30, width: 300, height: 200 }],
    edges: [],
  });

  assert.deepEqual(bounds, { minX: -20, minY: -30, maxX: 300, maxY: 250 });
});

test("fitViewport centers content in the available viewport", () => {
  assert.deepEqual(
    fitViewport({ minX: 0, minY: 0, maxX: 400, maxY: 200 }, 800, 600),
    { x: 200, y: 200, zoom: 1 },
  );
});

test("layoutShotsByScene orders shots by scene and shot order without mutating input", () => {
  const shots = [
    { shotId: "shot-2", x: 900, y: 900 },
    { shotId: "shot-1", x: 800, y: 800 },
  ];
  const laidOut = layoutShotsByScene(shots, [
    { shotId: "shot-2", sceneOrder: 2, shotOrder: 1 },
    { shotId: "shot-1", sceneOrder: 1, shotOrder: 2 },
  ]);

  assert.deepEqual(laidOut, [
    { shotId: "shot-1", x: 0, y: 0 },
    { shotId: "shot-2", x: 174, y: 0 },
  ]);
  assert.deepEqual(shots, [
    { shotId: "shot-2", x: 900, y: 900 },
    { shotId: "shot-1", x: 800, y: 800 },
  ]);
});
