/**
 * Phase 5 Task 5.5 — 剪辑导出 (RED).
 *
 * Verifies:
 *   - WebAV adapter: 持久 Asset URL → MP4Clip/ImgClip/Sprite/Combinator 映射
 *   - 不支持 WebCodecs 时提供 EDL / FCPXML / 服务端导出退路（不假成功）
 *   - EDL 导出确定性（同一 timeline → 同一 EDL）
 *
 * Run: node --test tests/v2-editor-exporters.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebavComposition,
  isWebCodecsSupported,
  exportEdl,
  exportFcpxml,
} from "../lib/editor/webav-adapter.ts";

const TIMELINE = {
  schemaVersion: "kiikis.timeline/1",
  tracks: [
    {
      id: "video-main",
      kind: "video",
      clips: [
        { id: "clip-1", sourceAssetVersionId: "av-1", in: 0, out: 3.5, duration: 3.5 },
        { id: "clip-2", sourceAssetVersionId: "av-2", in: 1.0, out: 4.0, duration: 3.0 },
      ],
    },
    {
      id: "audio-main",
      kind: "audio",
      clips: [{ id: "clip-3", sourceAssetVersionId: "av-3", in: 0, out: 3.5, duration: 3.5 }],
    },
  ],
  duration: 6.5,
};

const SOURCES = {
  "av-1": { storagePath: "video/owner/a.mp4", kind: "video" },
  "av-2": { storagePath: "video/owner/b.mp4", kind: "video" },
  "av-3": { storagePath: "audio/owner/c.mp3", kind: "audio" },
};

test("buildWebavComposition maps persistent URLs to clip sources in order", () => {
  const composition = buildWebavComposition({ timeline: TIMELINE, sources: SOURCES });
  assert.equal(composition.videoClips.length, 2);
  assert.equal(composition.videoClips[0].source.storagePath, "video/owner/a.mp4");
  assert.equal(composition.videoClips[1].source.storagePath, "video/owner/b.mp4");
  assert.equal(composition.audioClips.length, 1);
  // in/out preserved
  assert.equal(composition.videoClips[1].in, 1.0);
  assert.equal(composition.videoClips[1].out, 4.0);
});

test("missing source for an asset version is a hard error (no silent skip)", () => {
  assert.throws(
    () => buildWebavComposition({ timeline: TIMELINE, sources: { "av-1": SOURCES["av-1"] } }),
    /missing source|av-2/i,
  );
});

test("isWebCodecsSupported defaults false in node; EDL/FCPXML fallback always available", () => {
  assert.equal(isWebCodecsSupported({ hasWebCodecs: false }), false);
  const edl = exportEdl({ timeline: TIMELINE });
  assert.ok(edl.startsWith("TITLE: "));
  const fcpxml = exportFcpxml({ timeline: TIMELINE });
  assert.ok(fcpxml.includes("fcpxml"));
});

test("EDL export is deterministic for the same timeline", () => {
  const first = exportEdl({ timeline: TIMELINE });
  const second = exportEdl({ timeline: TIMELINE });
  assert.equal(first, second, "same timeline → identical EDL");
  assert.ok(first.includes("av-1"), "asset version id appears in EDL");
  assert.ok(first.split("\n").length >= 6, "both video clips produce EDL lines");
});
