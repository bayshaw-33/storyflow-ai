/**
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * kiikis.timeline/1 序列化/反序列化 契约测试
 *
 * PRD §10.1 单元/契约测试要求：Timeline 序列化/反序列化
 *
 * 验证目标：
 *   1. serializeTimeline 从 DB 行组装 KiikisTimeline DTO（三轨：video/voice/captions）
 *   2. deserializeTimeline 从 KiikisTimeline DTO 反向生成 assembly_items 时间码
 *   3. validateTimeline 校验 schemaVersion / projectId / tracks
 *   4. parseSequenceMeta 解析 metadata 中的 editor 元信息
 *   5. 禁止把 Provider 临时 URL 写入时间线（只引用稳定 ID）
 *   6. serialize → deserialize 往返一致
 *
 * 运行：node --test tests/v2-timeline-schema.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  serializeTimeline,
  deserializeTimeline,
  validateTimeline,
  parseSequenceMeta,
} from "../lib/editor/timeline-schema.ts";
import {
  TIMELINE_SCHEMA_VERSION,
  EDITOR_ENGINE_NONE,
  EDITOR_STATUS_FRAMEWORK,
} from "../lib/editor/types.ts";

// ============================================================
// 测试数据
// ============================================================

const baseSequence = {
  id: "seq-1",
  project_id: "proj-1",
  source_unit_id: "ep-1",
  owner_id: "owner-1",
  total_duration_seconds: 60,
  status: "draft",
  metadata: {},
  revision: 0,
  created_at: "2026-07-26T00:00:00Z",
  updated_at: "2026-07-26T00:00:00Z",
};

const baseItems = [
  {
    id: "item-1",
    assembly_sequence_id: "seq-1",
    shot_id: "shot-1",
    selected_take_id: "take-1",
    start_time_seconds: 0,
    end_time_seconds: 5,
    sort_order: 0,
  },
  {
    id: "item-2",
    assembly_sequence_id: "seq-1",
    shot_id: "shot-2",
    selected_take_id: "take-2",
    start_time_seconds: 5,
    end_time_seconds: 10,
    sort_order: 1,
  },
];

const baseTakes = [
  {
    id: "take-1",
    shot_id: "shot-1",
    project_id: "proj-1",
    take_label: "Take A",
    status: "current",
    video_url: "https://provider.example.com/temp/abc.mp4",
    metadata: {},
  },
  {
    id: "take-2",
    shot_id: "shot-2",
    project_id: "proj-1",
    take_label: "Take B",
    status: "current",
    video_url: null,
    metadata: {},
  },
];

const baseVoiceLines = [
  {
    id: "vl-1",
    shot_id: "shot-1",
    character_id: "char-1",
    dialogue_text: "你好世界",
    status: "approved",
    approved_asset_id: "asset-1",
    storage_path: "voice-lines/vl-1.mp3",
  },
  {
    id: "vl-2",
    shot_id: "shot-2",
    character_id: "char-2",
    dialogue_text: "明天见",
    status: "approved",
    approved_asset_id: "asset-2",
    storage_path: "voice-lines/vl-2.mp3",
  },
];

// ============================================================
// 1. serializeTimeline 基础契约
// ============================================================

test("serializeTimeline 输出 schemaVersion = kiikis.timeline/1", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  assert.equal(timeline.schemaVersion, "kiikis.timeline/1");
  assert.equal(timeline.projectId, "proj-1");
  assert.equal(timeline.sourceUnitId, "ep-1");
  assert.equal(timeline.aspectRatio, "9:16");
});

test("serializeTimeline 生成三轨：video / voice / captions", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const trackKinds = timeline.tracks.map((t) => t.kind);
  assert.deepEqual(trackKinds, ["video", "voice", "captions"]);
  assert.equal(timeline.tracks[0].id, "video-main");
  assert.equal(timeline.tracks[1].id, "voice-main");
  assert.equal(timeline.tracks[2].id, "captions-main");
});

test("serializeTimeline 视频轨只包含 status=current 的 take", () => {
  const nonCurrentTakes = [
    { ...baseTakes[0], status: "superseded" },
    baseTakes[1],
  ];
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: nonCurrentTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const videoTrack = timeline.tracks.find((t) => t.kind === "video");
  assert.equal(videoTrack.clips.length, 1, "只有 1 个 current take 应进入视频轨");
  assert.equal(videoTrack.clips[0].selectedTakeId, "take-2");
});

test("serializeTimeline 视频轨按 sort_order 排序", () => {
  const reversedItems = [baseItems[1], baseItems[0]];
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: reversedItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const videoTrack = timeline.tracks.find((t) => t.kind === "video");
  assert.equal(videoTrack.clips[0].shotId, "shot-1");
  assert.equal(videoTrack.clips[1].shotId, "shot-2");
});

// ============================================================
// 2. 禁止把 Provider 临时 URL 写入时间线
// ============================================================

test("serializeTimeline 不把 Provider 临时 URL 写入 clip", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      // clip 不应包含 videoUrl / url / providerUrl 等字段
      assert.equal(clip.videoUrl, undefined, "clip 不应包含 videoUrl");
      assert.equal(clip.url, undefined, "clip 不应包含 url");
      assert.equal(clip.providerUrl, undefined, "clip 不应包含 providerUrl");
    }
  }
});

test("serializeTimeline clip 只引用稳定 ID", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const videoClip = timeline.tracks[0].clips[0];
  assert.equal(videoClip.shotId, "shot-1");
  assert.equal(videoClip.selectedTakeId, "take-1");
  // id 应是 assembly_item 的 id（稳定 ID）
  assert.equal(videoClip.id, "item-1");
});

// ============================================================
// 3. 语音轨与字幕轨
// ============================================================

test("serializeTimeline 语音轨只包含 approved 且有 asset 的 voice_line", () => {
  const voiceLines = [
    ...baseVoiceLines,
    {
      id: "vl-3",
      shot_id: "shot-3",
      character_id: "char-3",
      dialogue_text: "未批准的",
      status: "generated",
      approved_asset_id: null,
      storage_path: null,
    },
  ];
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const voiceTrack = timeline.tracks.find((t) => t.kind === "voice");
  assert.equal(voiceTrack.clips.length, 2, "只有 2 个 approved voice line 应进入语音轨");
  const ids = voiceTrack.clips.map((c) => c.voiceLineId).sort();
  assert.deepEqual(ids, ["vl-1", "vl-2"]);
});

test("serializeTimeline 字幕轨包含所有有对白文本的 voice_line", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const captionTrack = timeline.tracks.find((t) => t.kind === "captions");
  assert.equal(captionTrack.clips.length, 2);
  assert.equal(captionTrack.clips[0].text, "你好世界");
  assert.equal(captionTrack.clips[1].text, "明天见");
});

// ============================================================
// 4. durationSeconds 计算
// ============================================================

test("serializeTimeline durationSeconds 至少为 sequence.total_duration_seconds", () => {
  const timeline = serializeTimeline({
    sequence: { ...baseSequence, total_duration_seconds: 120 },
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  assert.ok(timeline.durationSeconds >= 120, "durationSeconds 应 >= sequence.total_duration_seconds");
});

test("serializeTimeline durationSeconds 覆盖所有 clip 的 end", () => {
  const timeline = serializeTimeline({
    sequence: { ...baseSequence, total_duration_seconds: 0 },
    items: [
      { ...baseItems[0], start_time_seconds: 0, end_time_seconds: 50 },
    ],
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  assert.ok(timeline.durationSeconds >= 50, "durationSeconds 应 >= 视频轨最后 clip 的 end");
});

// ============================================================
// 5. 空数据容错
// ============================================================

test("serializeTimeline 空数据不抛错", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: [],
    selectedTakes: [],
    voiceLines: [],
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  assert.equal(timeline.tracks[0].clips.length, 0);
  assert.equal(timeline.tracks[1].clips.length, 0);
  assert.equal(timeline.tracks[2].clips.length, 0);
});

// ============================================================
// 6. deserializeTimeline 反序列化
// ============================================================

test("deserializeTimeline 从 video track 重建 assembly_items 时间码", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const result = deserializeTimeline(timeline);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, "item-1");
  assert.equal(result.items[0].start_time_seconds, 0);
  assert.equal(result.items[0].end_time_seconds, 5);
  assert.equal(result.items[1].id, "item-2");
  assert.equal(result.items[1].start_time_seconds, 5);
  assert.equal(result.items[1].end_time_seconds, 10);
  assert.equal(result.total_duration_seconds, timeline.durationSeconds);
});

// ============================================================
// 7. serialize → deserialize 往返一致性
// ============================================================

test("serialize → deserialize 往返一致", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const roundtrip = deserializeTimeline(timeline);
  // 视频 clip 数量应等于反序列化的 items 数量
  const videoClips = timeline.tracks.find((t) => t.kind === "video").clips;
  assert.equal(roundtrip.items.length, videoClips.length);
  // 每个 clip 的 id 在 roundtrip.items 中存在
  for (const clip of videoClips) {
    const found = roundtrip.items.find((i) => i.id === clip.id);
    assert.ok(found, `clip ${clip.id} 应在反序列化结果中存在`);
    assert.equal(found.start_time_seconds, clip.start);
    assert.equal(found.end_time_seconds, clip.start + clip.duration);
  }
});

// ============================================================
// 8. validateTimeline 校验
// ============================================================

test("validateTimeline 接受合法 timeline", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  const validated = validateTimeline(timeline);
  assert.equal(validated.schemaVersion, TIMELINE_SCHEMA_VERSION);
});

test("validateTimeline 拒绝非对象", () => {
  assert.throws(() => validateTimeline(null), /TIMELINE_INVALID:not_an_object/);
  assert.throws(() => validateTimeline("string"), /TIMELINE_INVALID:not_an_object/);
  assert.throws(() => validateTimeline(42), /TIMELINE_INVALID:not_an_object/);
});

test("validateTimeline 拒绝错误的 schemaVersion", () => {
  const timeline = serializeTimeline({
    sequence: baseSequence,
    items: baseItems,
    selectedTakes: baseTakes,
    voiceLines: baseVoiceLines,
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    aspectRatio: "9:16",
  });
  assert.throws(
    () => validateTimeline({ ...timeline, schemaVersion: "kiikis.timeline/2" }),
    /TIMELINE_INVALID:unsupported_schema_version/,
  );
});

test("validateTimeline 拒绝缺失 projectId", () => {
  assert.throws(
    () => validateTimeline({ schemaVersion: TIMELINE_SCHEMA_VERSION, tracks: [] }),
    /TIMELINE_INVALID:missing_projectId/,
  );
});

test("validateTimeline 拒绝缺失 tracks", () => {
  assert.throws(
    () => validateTimeline({ schemaVersion: TIMELINE_SCHEMA_VERSION, projectId: "p1" }),
    /TIMELINE_INVALID:missing_tracks/,
  );
});

// ============================================================
// 9. parseSequenceMeta
// ============================================================

test("parseSequenceMeta 缺失字段时返回默认值", () => {
  const meta = parseSequenceMeta({});
  assert.equal(meta.timeline_schema_version, TIMELINE_SCHEMA_VERSION);
  assert.equal(meta.editor_engine, EDITOR_ENGINE_NONE);
  assert.equal(meta.editor_status, EDITOR_STATUS_FRAMEWORK);
  assert.equal(meta.external_project_id, null);
  assert.equal(meta.external_project_version, null);
});

test("parseSequenceMeta 读取已有字段", () => {
  const meta = parseSequenceMeta({
    timeline_schema_version: "kiikis.timeline/1",
    editor_engine: "opencut",
    editor_status: "ready",
    external_project_id: "ext-1",
    external_project_version: "v1.0",
  });
  assert.equal(meta.timeline_schema_version, "kiikis.timeline/1");
  assert.equal(meta.editor_engine, "opencut");
  assert.equal(meta.editor_status, "ready");
  assert.equal(meta.external_project_id, "ext-1");
  assert.equal(meta.external_project_version, "v1.0");
});

console.log("✅ V2-06 Timeline Schema 契约测试完成");
