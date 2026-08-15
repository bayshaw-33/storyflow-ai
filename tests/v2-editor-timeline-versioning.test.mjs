/**
 * Phase 5 Task 5.5 — kiikis.timeline/1 round-trip + 版本 (RED).
 *
 * Verifies:
 *   - tracks/clips/source Asset Version/in/out/transform/audio/subtitle
 *     serialize + deserialize losslessly
 *   - unknown schema rejected
 *   - concurrent save → CAS conflict (409 semantics)
 *   - every save creates an Editing Work Version; finalized never overwritten
 *   - inputs (video/song/voice/subtitle) become editing_input links
 *
 * Run: node --test tests/v2-editor-timeline-versioning.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  roundTripTimeline,
  assertTimelineLossless,
  TimelineVersioningService,
  TimelineVersionError,
} from "../lib/server/v2/editing/index.ts";

// ============================================================
// 1. Round-trip 无损
// ============================================================

const SAMPLE = {
  schemaVersion: "kiikis.timeline/1",
  tracks: [
    {
      id: "video-main",
      kind: "video",
      clips: [
        {
          id: "clip-1",
          sourceAssetVersionId: "av-1",
          in: 0,
          out: 3.5,
          duration: 3.5,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      ],
    },
    {
      id: "audio-main",
      kind: "audio",
      clips: [
        { id: "clip-2", sourceAssetVersionId: "av-2", in: 0, out: 3.5, duration: 3.5, volume: 0.8 },
      ],
    },
    {
      id: "captions-main",
      kind: "subtitle",
      clips: [
        { id: "clip-3", text: "你好，废土", in: 0, out: 3.5, duration: 3.5 },
      ],
    },
  ],
  duration: 3.5,
};

test("timeline round-trips losslessly (tracks/clips/asset/transform/audio/subtitle)", () => {
  const restored = roundTripTimeline(SAMPLE);
  assertTimelineLossless(SAMPLE, restored);
  assert.deepEqual(restored, SAMPLE, "deep-equal after round trip");
});

test("unknown schema version is rejected", () => {
  assert.throws(
    () => roundTripTimeline({ ...SAMPLE, schemaVersion: "kiikis.timeline/999" }),
    /unsupported_schema_version|未知|schema/i,
  );
});

// ============================================================
// 2. 版本与并发
// ============================================================

function makeVersionStore(seed = []) {
  const tables = {
    storyflow_work_versions: [...seed],
  };
  let seq = 700;
  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    const table = url.pathname.replace("/rest/v1/", "").split("?")[0];
    const rows = tables[table];
    if (method === "GET") {
      let filtered = [...rows];
      for (const [key, raw] of url.searchParams.entries()) {
        if (["order", "limit", "select"].includes(key)) continue;
        const m = /^(eq|is)\.(.*)$/.exec(raw);
        if (m) filtered = filtered.filter((r) => (m[1] === "is" && m[2] === "null" ? r[key] == null : String(r[key]) === m[2]));
      }
      const order = url.searchParams.get("order");
      if (order?.startsWith("version_no.desc")) filtered.sort((a, b) => Number(b.version_no) - Number(a.version_no));
      return filtered;
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const row = { id: `edit-${String(++seq)}`, created_at: "2026-08-16T00:00:00Z", ...body };
      rows.push(row);
      return [row];
    }
    throw new Error(`Unsupported ${method} ${path}`);
  };
  return { fetcher, tables };
}

test("every save creates a new Editing Work Version; finalized never overwritten", async () => {
  const { fetcher, tables } = makeVersionStore([
    { id: "edit-1", work_id: "work-edit-1", version_no: 1, content_schema: "kiikis.timeline/1", finalized_at: "2026-08-10T00:00:00Z" },
  ]);
  const service = new TimelineVersioningService(fetcher);
  const v2 = await service.save({
    ownerId: "owner-1",
    workId: "work-edit-1",
    timeline: SAMPLE,
    baseVersionId: "edit-1",
  });
  assert.equal(v2.versionNo, 2);
  assert.equal(v2.finalized, false);
  assert.equal(tables.storyflow_work_versions.length, 2);
  assert.equal(tables.storyflow_work_versions[0].id, "edit-1", "v1 untouched");
  // saving on the latest base creates v3, but the finalized row itself is never updated
  const v3 = await service.save({
    ownerId: "owner-1",
    workId: "work-edit-1",
    timeline: SAMPLE,
    baseVersionId: v2.versionId,
  });
  assert.equal(v3.versionNo, 3);
  assert.equal(tables.storyflow_work_versions[0].finalized_at, "2026-08-10T00:00:00Z", "finalized row unchanged");
});

test("concurrent save with stale base → CAS conflict", async () => {
  const { fetcher, tables } = makeVersionStore([
    { id: "edit-1", work_id: "work-edit-1", version_no: 1, content_schema: "kiikis.timeline/1" },
  ]);
  const service = new TimelineVersioningService(fetcher);
  // someone else saved v2 before us
  tables.storyflow_work_versions.push({ id: "edit-2", work_id: "work-edit-1", version_no: 2, content_schema: "kiikis.timeline/1" });
  await assert.rejects(
    () => service.save({ ownerId: "owner-1", workId: "work-edit-1", timeline: SAMPLE, baseVersionId: "edit-1" }),
    (e) => e instanceof TimelineVersionError && e.code === "conflict",
  );
});

// ============================================================
// 3. editing_input links
// ============================================================

test("inputs (video/song/voice/subtitle) become editing_input link drafts", async () => {
  const { fetcher } = makeVersionStore();
  const service = new TimelineVersioningService(fetcher);
  const links = service.editingInputLinks({
    editingWorkId: "work-edit-1",
    editingVersionId: "edit-3",
    inputs: [
      { sourceWorkId: "work-video-1", sourceWorkVersionId: "wv-1", role: "video_source" },
      { sourceWorkId: "work-song-1", sourceWorkVersionId: "wv-2", role: "diegetic_song" },
      { sourceWorkId: "work-voice-1", sourceWorkVersionId: "wv-3", role: "character_voice" },
      { sourceWorkId: "work-sub-1", sourceWorkVersionId: "wv-4", role: "dialogue_line" },
    ],
  });
  assert.equal(links.length, 4);
  assert.ok(links.every((l) => l.targetWorkId === "work-edit-1"));
  assert.ok(links.every((l) => l.usageRole === "editing_input"));
  assert.deepEqual(links.map((l) => l.sourceWorkId).sort(), ["work-song-1", "work-sub-1", "work-video-1", "work-voice-1"]);
});
