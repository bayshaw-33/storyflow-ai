/**
 * KIIKIS V2.2 七类 Work 横向 Evidence — Phase 5 Task 5.6.
 *
 * script/song/art/storyboard/video/voice/editing 全部可导出
 * draft/checkpoint/finalized/messages/generations/choices/sources/universe/
 * rights/hashes；演员留痕（Actor/Portrayal/Asset Version/Job/人工选择/权利）；
 * 包内容清洗：临时 URL、secret、未授权原始声音绝不进包。
 *
 * 纯逻辑模块（无 I/O），供 node --test 直接测试。
 */

import { createHash } from "node:crypto";

export const ALL_WORK_TYPES = ["script", "song", "art", "storyboard", "video", "voice", "editing"] as const;
export type WorkType = (typeof ALL_WORK_TYPES)[number];

export interface WorkEvidenceInput {
  workType: WorkType;
  workId: string;
  universeId: string | null;
  versions: Array<{ id: string; kind: "editing_draft" | "checkpoint" | "finalized" }>;
  messages: number;
  generations: number;
  choices: number;
  rights: Record<string, unknown>;
  sources?: Array<{ sourceWorkId: string; sourceVersionId: string }>;
}

export interface WorkEvidenceEntry {
  workType: WorkType;
  workId: string;
  hasDraft: boolean;
  hasCheckpoint: boolean;
  hasFinalized: boolean;
  messageCount: number;
  generationCount: number;
  choiceCount: number;
  universeId: string | null;
  rights: Record<string, unknown>;
  versionHashes: string[];
  sources: Array<{ sourceWorkId: string; sourceVersionId: string }>;
}

/** 七类 Work 的横向 Evidence 清单。 */
export function buildAllWorkTypesManifest(input: {
  ownerId: string;
  projectId: string;
  works: WorkEvidenceInput[];
}): { works: WorkEvidenceEntry[] } {
  const works = input.works.map((w) => ({
    workType: w.workType,
    workId: w.workId,
    hasDraft: w.versions.some((v) => v.kind === "editing_draft"),
    hasCheckpoint: w.versions.some((v) => v.kind === "checkpoint"),
    hasFinalized: w.versions.some((v) => v.kind === "finalized"),
    messageCount: w.messages,
    generationCount: w.generations,
    choiceCount: w.choices,
    universeId: w.universeId,
    rights: w.rights,
    versionHashes: w.versions.map((v) => sha256(`${w.workId}:${v.id}`)),
    sources: w.sources ?? [],
  }));
  return { works };
}

// ---------------------------------------------------------------------------
// 演员留痕
// ---------------------------------------------------------------------------

export interface ActorEvidenceInput {
  actorId: string;
  actorName: string;
  portrayals: Array<{
    characterId: string;
    characterName: string;
    assetVersionIds: string[];
    generationJobIds: string[];
    selectedBy: string | null;
    selectedAt: string | null;
    rightsDeclaration: Record<string, unknown>;
  }>;
}

export interface ActorEvidenceEntry {
  actorId: string;
  actorName: string;
  characterId: string;
  characterName: string;
  assetVersionIds: string[];
  generationJobIds: string[];
  humanSelected: boolean;
  selectedBy: string | null;
  rightsDeclaration: Record<string, unknown>;
  evidenceHash: string;
}

/** Actor/Portrayal/Asset Version、生成 Job、人工选择和权利声明 → Evidence。 */
export function actorEvidenceEntries(input: ActorEvidenceInput): ActorEvidenceEntry[] {
  return input.portrayals.map((p) => {
    const evidenceHash = sha256(
      [
        input.actorId,
        p.characterId,
        p.assetVersionIds.join(","),
        p.generationJobIds.join(","),
        p.selectedBy ?? "",
        p.selectedAt ?? "",
        JSON.stringify(p.rightsDeclaration),
      ].join("|"),
    );
    return {
      actorId: input.actorId,
      actorName: input.actorName,
      characterId: p.characterId,
      characterName: p.characterName,
      assetVersionIds: [...p.assetVersionIds],
      generationJobIds: [...p.generationJobIds],
      humanSelected: Boolean(p.selectedBy && p.selectedAt),
      selectedBy: p.selectedBy,
      rightsDeclaration: { ...p.rightsDeclaration },
      evidenceHash,
    };
  });
}

// ---------------------------------------------------------------------------
// 包内容清洗
// ---------------------------------------------------------------------------

export interface PackageEntryCandidate {
  path: string;
  url?: string;
  content?: string;
  kind: string;
}

/**
 * 清洗：只保留持久 storage、非 secret、非未授权声音的条目。
 * 临时 Provider URL / secret / 未授权原始声音一律剔除。
 */
export function sanitizePackageEntries(entries: PackageEntryCandidate[]): PackageEntryCandidate[] {
  return entries.filter((e) => {
    if (e.kind === "secret") return false;
    if (e.kind === "unauthorized_voice") return false;
    if (e.kind === "provider_temp") return false;
    if (e.url && /\/tasks\/|\/jobs\/|\/generate\//.test(e.url)) return false;
    if (e.path.includes("secrets") || e.path.includes(".env")) return false;
    return true;
  });
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
