/**
 * KIIKIS V2.2 WebAV adapter + 导出退路 — Phase 5 Task 5.5.
 *
 * WebAV 只负责浏览器预览/组合：把持久 Asset URL 映射为
 * MP4Clip / ImgClip / Sprite / Combinator 输入。
 * 不支持 WebCodecs 时明确提供 EDL / FCPXML / 服务端导出（绝不假成功）。
 *
 * 纯逻辑模块（无浏览器依赖），供 node --test 直接测试。
 */

export interface WebavSource {
  storagePath: string;
  kind: "video" | "audio" | "image";
}

export interface WebavComposition {
  videoClips: Array<{ id: string; source: WebavSource; in: number; out: number; duration: number }>;
  audioClips: Array<{ id: string; source: WebavSource; in: number; out: number; duration: number }>;
  width: number;
  height: number;
}

export function isWebCodecsSupported(env: { hasWebCodecs?: boolean }): boolean {
  return env.hasWebCodecs === true;
}

/**
 * 持久 Asset URL → WebAV clip 输入。缺来源是硬错误（不静默跳过）。
 */
export function buildWebavComposition(input: {
  timeline: {
    schemaVersion: string;
    tracks: Array<{
      id: string;
      kind: string;
      clips: Array<{ id: string; sourceAssetVersionId?: string; in?: number; out?: number; duration: number }>;
    }>;
    duration: number;
  };
  sources: Record<string, WebavSource>;
}): WebavComposition {
  const videoClips: WebavComposition["videoClips"] = [];
  const audioClips: WebavComposition["audioClips"] = [];
  for (const track of input.timeline.tracks) {
    for (const clip of track.clips) {
      const sourceId = clip.sourceAssetVersionId;
      if (!sourceId) continue;
      const source = input.sources[sourceId];
      if (!source) {
        throw new Error(`missing source for asset version ${sourceId}`);
      }
      const item = {
        id: clip.id,
        source,
        in: clip.in ?? 0,
        out: clip.out ?? clip.duration,
        duration: clip.duration,
      };
      if (track.kind === "audio" || source.kind === "audio") {
        audioClips.push(item);
      } else {
        videoClips.push(item);
      }
    }
  }
  return { videoClips, audioClips, width: 1080, height: 1920 };
}

function fmtTimecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${sec.toFixed(2).padStart(5, "0")}`;
}

/** 确定性 EDL 导出（同一 timeline → 同一输出）。 */
export function exportEdl(input: {
  timeline: {
    schemaVersion: string;
    tracks: Array<{ id: string; kind: string; clips: Array<{ id: string; duration: number; sourceAssetVersionId?: string }> }>;
    duration: number;
  };
}): string {
  const lines: string[] = [`TITLE: KIIKIS timeline ${input.timeline.schemaVersion}`];
  let counter = 0;
  for (const track of input.timeline.tracks) {
    if (track.kind === "audio") continue;
    for (const clip of track.clips) {
      counter += 1;
      const start = (counter - 1) * clip.duration;
      lines.push(`${String(counter).padStart(3, "0")}  AX       V     C        ${fmtTimecode(start)} ${fmtTimecode(start + clip.duration)} ${fmtTimecode(start)} ${fmtTimecode(start + clip.duration)}`);
      lines.push(`* FROM CLIP NAME: ${clip.sourceAssetVersionId ?? clip.id}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** FCPXML 导出（XML 1.0，UTF-8）。 */
export function exportFcpxml(input: {
  timeline: {
    schemaVersion: string;
    tracks: Array<{ id: string; kind: string; clips: Array<{ id: string; duration: number; sourceAssetVersionId?: string }> }>;
    duration: number;
  };
}): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const assets: string[] = [];
  const clipsXml: string[] = [];
  for (const track of input.timeline.tracks) {
    for (const clip of track.clips) {
      const assetId = clip.sourceAssetVersionId ?? clip.id;
      assets.push(`<asset id="asset-${esc(assetId)}" name="${esc(assetId)}" src="persistent://${esc(assetId)}"/>`);
      clipsXml.push(`<clip name="${esc(clip.id)}" duration="${Math.round(clip.duration * 1000)}/1000s" ref="asset-${esc(assetId)}"/>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.9">
  <resources>${assets.join("")}</resources>
  <library><event><project name="KIIKIS timeline">
    <sequence duration="${Math.round(input.timeline.duration * 1000)}/1000s">${clipsXml.join("")}</sequence>
  </project></event></library>
</fcpxml>`;
}
