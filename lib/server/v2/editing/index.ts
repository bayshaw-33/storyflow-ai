/**
 * KIIKIS V2.2 Editing timeline versioning — Phase 5 Task 5.5.
 *
 * Timeline 持久化为 Phase 1 Work Version（contentSchema = "kiikis.timeline/1"）。
 *   - 每次保存创建新的 Editing Work Version（append-only）
 *   - baseVersionId CAS：并发保存 → conflict（409 语义）
 *   - 输入（视频/歌曲/配音/字幕）→ editing_input WorkUsageLink 草稿
 *   - Finalized timeline 永不覆盖（只新增版本）
 *
 * 纯逻辑 + 可注入 fetcher（PostgREST 语义），供 node --test 直接测试。
 */

import assert from "node:assert/strict";

import {
  TIMELINE_SCHEMA_VERSION,
  type KiikisTimeline,
} from "../../../editor/types.ts";

export class TimelineVersionError extends Error {
  readonly code: "conflict" | "not_found" | "validation_failed" | "service_unavailable";
  constructor(code: TimelineVersionError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "TimelineVersionError";
    this.code = code;
  }
}

export interface TimelineClipLike {
  id: string;
  sourceAssetVersionId?: string;
  in?: number;
  out?: number;
  duration: number;
  transform?: Record<string, unknown>;
  volume?: number;
  text?: string;
}

export interface TimelineTrackLike {
  id: string;
  kind: string;
  clips: TimelineClipLike[];
}

export interface TimelineLike {
  schemaVersion: string;
  tracks: TimelineTrackLike[];
  duration: number;
}

/** 序列化 → 反序列化 round-trip；未知 schema 拒绝。 */
export function roundTripTimeline(timeline: TimelineLike): TimelineLike {
  if (timeline.schemaVersion !== TIMELINE_SCHEMA_VERSION) {
    throw new TimelineVersionError("validation_failed", `unsupported_schema_version:${timeline.schemaVersion}`);
  }
  return structuredClone(timeline) as TimelineLike;
}

/** 断言无损：round-trip 后与输入深度相等。 */
export function assertTimelineLossless(original: TimelineLike, restored: TimelineLike): void {
  assert.deepEqual(restored, original);
}

export interface TimelineSaveResult {
  versionId: string;
  versionNo: number;
  finalized: boolean;
}

interface VersionRow {
  id: string;
  work_id: string;
  version_no: number;
  content_schema: string;
  finalized_at: string | null;
}

export class TimelineVersioningService {
  private readonly fetcher: (path: string, init?: RequestInit) => Promise<unknown>;

  constructor(fetcher: (path: string, init?: RequestInit) => Promise<unknown>) {
    this.fetcher = fetcher;
  }

  /**
   * 保存 timeline → 新 Editing Work Version。
   * baseVersionId 必须是当前最新版本，否则视为并发 → conflict。
   */
  async save(input: {
    ownerId: string;
    workId: string;
    timeline: TimelineLike;
    baseVersionId: string | null;
  }): Promise<TimelineSaveResult> {
    if (input.timeline.schemaVersion !== TIMELINE_SCHEMA_VERSION) {
      throw new TimelineVersionError("validation_failed", `unsupported_schema_version:${input.timeline.schemaVersion}`);
    }
    const rows = (await this.fetcher(
      `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(input.workId)}&select=id,work_id,version_no,content_schema,finalized_at&order=version_no.desc&limit=1`,
    )) as VersionRow[];
    const latest = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (input.baseVersionId) {
      if (!latest || latest.id !== input.baseVersionId) {
        throw new TimelineVersionError("conflict", `Base version ${input.baseVersionId} is not the latest (current ${latest?.id ?? "none"}).`);
      }
    }
    const nextNo = Number(latest?.version_no ?? 0) + 1;
    const inserted = (await this.fetcher("/rest/v1/storyflow_work_versions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        work_id: input.workId,
        version_no: nextNo,
        content_schema: TIMELINE_SCHEMA_VERSION,
        content_json: { timeline: input.timeline },
        created_by: input.ownerId,
      }),
    })) as VersionRow[];
    const row = Array.isArray(inserted) ? inserted[0] : (inserted as VersionRow);
    if (!row?.id) throw new TimelineVersionError("service_unavailable", "Failed to persist editing version.");
    return { versionId: String(row.id), versionNo: Number(row.version_no), finalized: Boolean(row.finalized_at) };
  }

  /** 输入（视频/歌曲/配音/字幕）→ editing_input usage link 草稿。 */
  editingInputLinks(input: {
    editingWorkId: string;
    editingVersionId: string;
    inputs: Array<{ sourceWorkId: string; sourceWorkVersionId: string; role: string }>;
  }): Array<{
    sourceWorkId: string;
    sourceWorkVersionId: string;
    targetWorkId: string;
    usageRole: "editing_input";
    targetEntityType: string | null;
    targetEntityId: string | null;
  }> {
    return input.inputs.map((i) => ({
      sourceWorkId: i.sourceWorkId,
      sourceWorkVersionId: i.sourceWorkVersionId,
      targetWorkId: input.editingWorkId,
      usageRole: "editing_input" as const,
      targetEntityType: null,
      targetEntityId: null,
    }));
  }
}
