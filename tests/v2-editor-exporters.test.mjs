/**
 * TRAE-V2-06 Editor Framework — 导出器单元测试
 *
 * 覆盖：
 *   1. FCPXML 1.9 结构正确性（resources / library / sequence / spine）
 *   2. EDL CMX 3600 结构正确性（TITLE / 事件行 / 注释行 / END）
 *   3. 时间码转换（秒 → HH:MM:SS:FF / 分数秒）
 *   4. 三轨分别导出（video / voice / captions）
 *   5. XML 转义（& < > " '）
 *   6. 文件名 sanitize
 *   7. 不支持的 format 抛错
 *   8. 空轨道处理
 *   9. fps 自定义
 *  10. Content-Type / 文件扩展名映射
 *
 * 运行：node --test tests/v2-editor-exporters.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  serializeToFCPXML,
  FCPXML_VERSION,
  DEFAULT_FPS as FCPXML_FPS,
} from "../lib/editor/exporters/fcpxml.ts";
import {
  serializeToEDL,
  DEFAULT_FPS as EDL_FPS,
} from "../lib/editor/exporters/edl.ts";
import {
  serializeToFormat,
  isSupportedFormat,
  EXPORT_FORMATS,
  getFormatInfo,
} from "../lib/editor/exporters/index.ts";

// 注：.mjs 不支持 import type，类型检查由 TypeScript 编译时保证

// ============================================================
// 测试数据
// ============================================================

function makeTimeline(overrides = {}) {
  const base = {
    schemaVersion: "kiikis.timeline/1",
    projectId: "test-project",
    sourceUnitId: "unit-1",
    aspectRatio: "9:16",
    durationSeconds: 15,
    tracks: [
      {
        id: "video-main",
        kind: "video",
        clips: [
          {
            id: "v1",
            shotId: "shot-001",
            selectedTakeId: "take-1",
            assetId: "asset-1",
            start: 0,
            duration: 5,
            trimIn: 0,
            trimOut: 5,
            label: "Shot 1",
          },
          {
            id: "v2",
            shotId: "shot-002",
            selectedTakeId: "take-2",
            assetId: "asset-2",
            start: 5,
            duration: 5,
            label: "Shot 2",
          },
          {
            id: "v3",
            shotId: "shot-003",
            selectedTakeId: "take-3",
            assetId: "asset-3",
            start: 10,
            duration: 5,
            label: "Shot 3",
          },
        ],
      },
      {
        id: "voice-main",
        kind: "voice",
        clips: [
          {
            id: "voice-1",
            shotId: "shot-001",
            voiceLineId: "vl-1",
            characterId: "char-1",
            start: 0,
            duration: 5,
            label: "Hello world",
          },
        ],
      },
      {
        id: "captions-main",
        kind: "captions",
        clips: [
          {
            id: "caption-1",
            shotId: "shot-001",
            voiceLineId: "vl-1",
            characterId: "char-1",
            start: 0,
            duration: 5,
            text: "你好世界",
            label: "Caption 1",
          },
        ],
      },
    ],
    serializedAt: "2026-07-27T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

// ============================================================
// 1. FCPXML 基本结构
// ============================================================

test("FCPXML: 版本声明为 1.9", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`<fcpxml version="${FCPXML_VERSION}">`));
  assert.equal(FCPXML_VERSION, "1.9");
});

test("FCPXML: 包含 resources/format 节点", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`<resources>`));
  assert.ok(xml.includes(`<format id="r1"`));
  assert.ok(xml.includes(`frameDuration="1/30s"`));
});

test("FCPXML: 9:16 分辨率映射为 1080x1920", () => {
  const xml = serializeToFCPXML(makeTimeline({ aspectRatio: "9:16" }));
  assert.ok(xml.includes(`width="1080"`));
  assert.ok(xml.includes(`height="1920"`));
});

test("FCPXML: 16:9 分辨率映射为 1920x1080", () => {
  const xml = serializeToFCPXML(makeTimeline({ aspectRatio: "16:9" }));
  assert.ok(xml.includes(`width="1920"`));
  assert.ok(xml.includes(`height="1080"`));
});

test("FCPXML: 1:1 分辨率映射为 1080x1080", () => {
  const xml = serializeToFCPXML(makeTimeline({ aspectRatio: "1:1" }));
  assert.ok(xml.includes(`width="1080"`));
  assert.ok(xml.includes(`height="1080"`));
});

test("FCPXML: 包含 library > event > project > sequence > spine 层级", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`<library>`));
  assert.ok(xml.includes(`<event name="Kiikis Export">`));
  assert.ok(xml.includes(`<project name="Kiikis-test-project">`));
  assert.ok(xml.includes(`<sequence format="r1"`));
  assert.ok(xml.includes(`<spine>`));
});

// ============================================================
// 2. FCPXML assets 生成
// ============================================================

test("FCPXML: video clips 生成 hasVideo=1 的 asset", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`hasVideo="1"`));
  // 3 个 video clip
  const videoAssetCount = (xml.match(/hasVideo="1"/g) || []).length;
  assert.equal(videoAssetCount, 3);
});

test("FCPXML: voice clips 生成 hasAudio=1 的 asset", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`hasAudio="1"`));
  const audioAssetCount = (xml.match(/hasAudio="1"/g) || []).length;
  assert.equal(audioAssetCount, 1);
});

test("FCPXML: asset src 用 file://kiikis/ 占位符", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`src="file://kiikis/video/`));
  assert.ok(xml.includes(`src="file://kiikis/audio/`));
  assert.ok(!xml.includes("https://"), "不应包含任何 https URL");
  assert.ok(!xml.includes("supabase"), "不应包含 supabase 域名");
});

test("FCPXML: asset name 来自 clip.label", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`name="Shot 1"`));
  assert.ok(xml.includes(`name="Shot 2"`));
  assert.ok(xml.includes(`name="Shot 3"`));
});

// ============================================================
// 3. FCPXML 时间码（分数秒）
// ============================================================

test("FCPXML: 30fps 时 5s → 5s（整数秒不变）", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`duration="5s"`));
});

test("FCPXML: 30fps 时 1/30s 是 frameDuration", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`frameDuration="1/30s"`));
});

test("FCPXML: 自定义 fps 25 时 frameDuration=1/25s", () => {
  const xml = serializeToFCPXML(makeTimeline(), { fps: 25 });
  assert.ok(xml.includes(`frameDuration="1/25s"`));
});

test("FCPXML: 非整数秒用分数表示（如 3.5s @ 30fps → 7/2s）", () => {
  const timeline = makeTimeline({
    durationSeconds: 3.5,
    tracks: [
      {
        id: "video-main",
        kind: "video",
        clips: [
          {
            id: "v1",
            shotId: "shot-001",
            start: 0,
            duration: 3.5,
            label: "Shot 1",
          },
        ],
      },
      { id: "voice-main", kind: "voice", clips: [] },
      { id: "captions-main", kind: "captions", clips: [] },
    ],
  });
  const xml = serializeToFCPXML(timeline);
  // 3.5s @ 30fps = 105 帧，gcd(105,30)=15，105/15=7, 30/15=2 → 7/2s
  assert.ok(xml.includes(`duration="7/2s"`), "应该用约分后的分数表示");
});

// ============================================================
// 4. FCPXML 三轨布局
// ============================================================

test("FCPXML: video clips 在主 spine 上", () => {
  const xml = serializeToFCPXML(makeTimeline());
  // 主 spine 内有 asset-clip（不带 lane 属性）
  assert.ok(xml.includes(`<asset-clip ref="r2"`));
  assert.ok(xml.includes(`<asset-clip ref="r3"`));
  assert.ok(xml.includes(`<asset-clip ref="r4"`));
});

test("FCPXML: voice clips 在 audio lane A1", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`<audio lane="A1">`));
  // r5 是第 4 个 asset（前 3 个是 video，第 4 个是 voice）
  assert.ok(xml.includes(`<asset-clip ref="r5"`));
});

test("FCPXML: captions 作为 title 在 V2 lane", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(xml.includes(`<spine lane="V2">`));
  assert.ok(xml.includes(`<title`));
  assert.ok(xml.includes(`你好世界`));
});

// ============================================================
// 5. FCPXML XML 转义
// ============================================================

test("FCPXML: 特殊字符被转义", () => {
  const timeline = makeTimeline({
    tracks: [
      {
        id: "video-main",
        kind: "video",
        clips: [
          {
            id: "v1",
            shotId: "shot-001",
            start: 0,
            duration: 5,
            label: 'A & B <C> "D" \'E\'',
          },
        ],
      },
      { id: "voice-main", kind: "voice", clips: [] },
      { id: "captions-main", kind: "captions", clips: [] },
    ],
  });
  const xml = serializeToFCPXML(timeline);
  assert.ok(xml.includes(`A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;`));
  assert.ok(!xml.includes("A & B <C>"));
});

// ============================================================
// 6. FCPXML 空轨道处理
// ============================================================

test("FCPXML: 无 voice clip 时不生成 audio lane", () => {
  const timeline = makeTimeline({
    tracks: [
      {
        id: "video-main",
        kind: "video",
        clips: [
          { id: "v1", shotId: "s1", start: 0, duration: 5, label: "Shot 1" },
        ],
      },
      { id: "voice-main", kind: "voice", clips: [] },
      { id: "captions-main", kind: "captions", clips: [] },
    ],
  });
  const xml = serializeToFCPXML(timeline);
  assert.ok(!xml.includes(`<audio lane="A1">`));
  assert.ok(!xml.includes(`<spine lane="V2">`));
});

test("FCPXML: 完全空轨道也能生成合法 XML", () => {
  const timeline = makeTimeline({
    durationSeconds: 0,
    tracks: [
      { id: "video-main", kind: "video", clips: [] },
      { id: "voice-main", kind: "voice", clips: [] },
      { id: "captions-main", kind: "captions", clips: [] },
    ],
  });
  const xml = serializeToFCPXML(timeline);
  assert.ok(xml.includes(`<fcpxml version="1.9">`));
  assert.ok(xml.includes(`</fcpxml>`));
  // 空 spine
  assert.ok(xml.includes(`<spine>`));
  assert.ok(xml.includes(`</spine>`));
});

// ============================================================
// 7. EDL 基本结构
// ============================================================

test("EDL: 以 TITLE 开头，END 结尾", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.startsWith("TITLE: "));
  assert.ok(edl.includes("\nEND"));
});

test("EDL: 事件行符合 CMX 3600 格式", () => {
  const edl = serializeToEDL(makeTimeline());
  const lines = edl.split("\n");
  // 找第一个事件行（3位数字 + AX + V + C）
  const eventLine = lines.find((l) => /^\d{3}\s+AX\s+V\s+C\s+/.test(l));
  assert.ok(eventLine, "应包含 CMX 3600 事件行");
  // 验证格式：001  AX       V     C        00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00
  assert.match(
    eventLine,
    /^\d{3}\s+AX\s+V\s+C\s+\d{2}:\d{2}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}:\d{2}$/,
  );
});

test("EDL: 3 个 video clip 生成 3 条事件", () => {
  const edl = serializeToEDL(makeTimeline());
  const eventCount = (edl.match(/^\d{3}\s+AX\s+V\s+C\s+/gm) || []).length;
  assert.equal(eventCount, 3);
});

test("EDL: 事件编号递增（001, 002, 003）", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.includes("001  AX"));
  assert.ok(edl.includes("002  AX"));
  assert.ok(edl.includes("003  AX"));
});

// ============================================================
// 8. EDL 时间码
// ============================================================

test("EDL: 30fps 默认时 5s → 00:00:05:00", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.includes("00:00:05:00"));
});

test("EDL: 25fps 时 5s → 00:00:05:00（整秒不变）", () => {
  const edl = serializeToEDL(makeTimeline(), { fps: 25 });
  assert.ok(edl.includes("00:00:05:00"));
});

test("EDL: 30fps 时 3.5s → 00:00:03:15（3秒 + 15帧）", () => {
  const timeline = makeTimeline({
    durationSeconds: 3.5,
    tracks: [
      {
        id: "video-main",
        kind: "video",
        clips: [
          { id: "v1", shotId: "s1", start: 0, duration: 3.5, label: "Shot 1" },
        ],
      },
      { id: "voice-main", kind: "voice", clips: [] },
      { id: "captions-main", kind: "captions", clips: [] },
    ],
  });
  const edl = serializeToEDL(timeline, { fps: 30 });
  // 3.5s @ 30fps = 3秒 + 15帧
  assert.ok(edl.includes("00:00:03:15"));
});

test("EDL: 时间码格式始终是 HH:MM:SS:FF（4 段 2 位补零）", () => {
  const edl = serializeToEDL(makeTimeline());
  const lines = edl.split("\n");
  const eventLine = lines.find((l) => /^\d{3}\s+AX\s+V\s+C\s+/.test(l));
  assert.ok(eventLine);
  const tcPattern = /\d{2}:\d{2}:\d{2}:\d{2}/g;
  const matches = eventLine.match(tcPattern) || [];
  assert.equal(matches.length, 4, "事件行应包含 4 个时间码");
});

// ============================================================
// 9. EDL 注释行
// ============================================================

test("EDL: FROM CLIP NAME 注释行", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.includes("* FROM CLIP NAME:  Shot 1"));
  assert.ok(edl.includes("* FROM CLIP NAME:  Shot 2"));
});

test("EDL: FROM CLIP 注释行用 kiikis-<shotId>.mp4 占位符", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.includes("* FROM CLIP: kiikis-shot-001.mp4"));
  assert.ok(edl.includes("* FROM CLIP: kiikis-shot-002.mp4"));
  assert.ok(!edl.includes("https://"), "不应包含任何 https URL");
});

test("EDL: assetId/selectedTakeId 作为 COMMENT 注释", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.includes("* COMMENT: assetId=asset-1"));
  assert.ok(edl.includes("* COMMENT: selectedTakeId=take-1"));
});

test("EDL: voice clips 作为 AUDIO 注释块", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.includes("M2: AUDIO FROM VOICE LINES"));
  assert.ok(edl.includes("* AUDIO:"));
  assert.ok(edl.includes("voiceLineId=vl-1"));
});

test("EDL: captions 作为 CAPTION 注释块", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(edl.includes("M2: CAPTIONS FROM VOICE LINES"));
  assert.ok(edl.includes("* CAPTION:"));
  assert.ok(edl.includes("你好世界"));
});

test("EDL: 无 voice/captions 时不生成 M2 注释块", () => {
  const timeline = makeTimeline({
    tracks: [
      {
        id: "video-main",
        kind: "video",
        clips: [
          { id: "v1", shotId: "s1", start: 0, duration: 5, label: "Shot 1" },
        ],
      },
      { id: "voice-main", kind: "voice", clips: [] },
      { id: "captions-main", kind: "captions", clips: [] },
    ],
  });
  const edl = serializeToEDL(timeline);
  assert.ok(!edl.includes("M2: AUDIO"));
  assert.ok(!edl.includes("M2: CAPTIONS"));
});

// ============================================================
// 10. 统一入口 serializeToFormat
// ============================================================

test("serializeToFormat: fcpxml 返回正确的 mimeType 和扩展名", () => {
  const result = serializeToFormat(makeTimeline(), "fcpxml");
  assert.equal(result.format, "fcpxml");
  assert.ok(result.mimeType.includes("xml"));
  assert.equal(result.fileExtension, "fcpxml");
  assert.ok(result.suggestedFilename.endsWith(".fcpxml"));
});

test("serializeToFormat: edl 返回正确的 mimeType 和扩展名", () => {
  const result = serializeToFormat(makeTimeline(), "edl");
  assert.equal(result.format, "edl");
  assert.ok(result.mimeType.includes("text/plain"));
  assert.equal(result.fileExtension, "edl");
  assert.ok(result.suggestedFilename.endsWith(".edl"));
});

test("serializeToFormat: suggestedFilename 以 projectId 为前缀", () => {
  const result = serializeToFormat(makeTimeline(), "fcpxml");
  assert.ok(result.suggestedFilename.startsWith("Kiikis-test-project"));
});

test("serializeToFormat: 文件名 sanitize 替换非法字符", () => {
  const timeline = makeTimeline({ projectId: 'bad/name:"file' });
  const result = serializeToFormat(timeline, "fcpxml");
  assert.ok(!result.suggestedFilename.includes("/"));
  assert.ok(!result.suggestedFilename.includes(":"));
  assert.ok(!result.suggestedFilename.includes('"'));
});

test("isSupportedFormat: fcpxml 和 edl 为 true", () => {
  assert.equal(isSupportedFormat("fcpxml"), true);
  assert.equal(isSupportedFormat("edl"), true);
});

test("isSupportedFormat: 其他格式为 false", () => {
  assert.equal(isSupportedFormat("premiere"), false);
  assert.equal(isSupportedFormat("xml"), false);
  assert.equal(isSupportedFormat(""), false);
  assert.equal(isSupportedFormat("FCPXML"), false); // 大小写敏感
});

test("EXPORT_FORMATS 包含 fcpxml 和 edl", () => {
  assert.ok(EXPORT_FORMATS.includes("fcpxml"));
  assert.ok(EXPORT_FORMATS.includes("edl"));
  assert.equal(EXPORT_FORMATS.length, 2);
});

// ============================================================
// 11. getFormatInfo
// ============================================================

test("getFormatInfo: fcpxml 兼容 Final Cut Pro / DaVinci Resolve / Premiere", () => {
  const info = getFormatInfo("fcpxml");
  assert.ok(info.compatibleApps.includes("Final Cut Pro"));
  assert.ok(info.compatibleApps.includes("DaVinci Resolve"));
  assert.ok(info.compatibleApps.includes("Premiere Pro"));
  assert.ok(info.extensions.includes(".fcpxml"));
});

test("getFormatInfo: edl 标注'所有专业剪辑软件'", () => {
  const info = getFormatInfo("edl");
  assert.ok(info.compatibleApps.includes("所有专业剪辑软件"));
  assert.ok(info.extensions.includes(".edl"));
});

// ============================================================
// 12. 安全性：不泄露 Provider 临时 URL
// ============================================================

test("FCPXML: 不包含 supabase 域名", () => {
  const xml = serializeToFCPXML(makeTimeline());
  assert.ok(!xml.includes("supabase.co"));
  assert.ok(!xml.includes("signed-url"));
  assert.ok(!xml.includes("token="));
});

test("EDL: 不包含 supabase 域名", () => {
  const edl = serializeToEDL(makeTimeline());
  assert.ok(!edl.includes("supabase.co"));
  assert.ok(!edl.includes("signed-url"));
  assert.ok(!edl.includes("token="));
});

console.log("✅ V2-06 Editor Exporters 测试完成");
