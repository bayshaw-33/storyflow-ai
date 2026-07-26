/**
 * TRAE-V2-07 Production Package 与资产清单
 * 打包逻辑：聚合各模块数据 → 生成完整 ProductionPackage
 *
 * 容错策略：
 *   - 单个模块失败不影响整包
 *   - 失败的模块在 manifest 中标记 failed
 *   - missing 的资源（如未关联 universe）标记 missing
 *   - 不伪造空文件
 */

import {
  resolveProjectScope,
  fetchUniverseCanon,
  fetchCharacterGraph,
  fetchCharacterPassports,
  fetchVoiceProfiles,
  fetchScriptEpisode,
  fetchScenes,
  fetchDirectorShotList,
  fetchDirectorPrompts,
  fetchSelectedTakes,
  fetchVoiceLines,
  fetchAssets,
  fetchAssemblyTimeline,
  fetchGenerationJobs,
} from "./queries";
import {
  okEntry,
  missingEntry,
  failedEntry,
  emptyEntry,
  buildManifest,
} from "./manifest";
import { isExportError, ExportError } from "./types";
import type {
  ManifestEntry,
  ProductionPackage,
  ProductionManifest,
} from "./types";

// ============================================================
// 单个文件构造器
// ============================================================

type FileResult =
  | { kind: "ok"; path: string; content: string; mimeType: string }
  | { kind: "missing"; path: string; reason: string }
  | { kind: "empty"; path: string; reason: string }
  | { kind: "failed"; path: string; reason: string };

function toEntryAndFile(result: FileResult): {
  entry: ManifestEntry;
  file?: { path: string; content: string; mimeType: string };
} {
  switch (result.kind) {
    case "ok":
      return { entry: okEntry(result.path, result.content), file: { path: result.path, content: result.content, mimeType: result.mimeType } };
    case "missing":
      return { entry: missingEntry(result.path, result.reason) };
    case "empty":
      return { entry: emptyEntry(result.path, result.reason), file: { path: result.path, content: "", mimeType: "application/json" } };
    case "failed":
      return { entry: failedEntry(result.path, result.reason) };
  }
}

/**
 * 安全执行：失败返回 failed 结果，不抛出
 */
async function safeRun(
  path: string,
  mimeType: string,
  fn: () => Promise<string | null | { __missing: true; reason: string } | { __empty: true; reason: string }>,
): Promise<FileResult> {
  try {
    const result = await fn();
    if (result === null) {
      return { kind: "missing", path, reason: "数据不存在" };
    }
    if (typeof result === "object" && result !== null && "__missing" in result) {
      return { kind: "missing", path, reason: result.reason };
    }
    if (typeof result === "object" && result !== null && "__empty" in result) {
      return { kind: "empty", path, reason: result.reason };
    }
    return { kind: "ok", path, content: result as string, mimeType };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : String(err);
    return { kind: "failed", path, reason };
  }
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// ============================================================
// 主打包函数
// ============================================================

export async function buildProductionPackage(params: {
  ownerId: string;
  projectId: string;
  sourceUnitId?: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}): Promise<{
  package: ProductionPackage;
  manifest: ProductionManifest;
}> {
  const { ownerId, projectId } = params;
  const aspectRatio = params.aspectRatio ?? "9:16";

  // 1. 解析项目作用域
  const scope = await resolveProjectScope(ownerId, projectId);
  const sourceUnitId = params.sourceUnitId ?? scope.sourceUnitId;

  // 2. 并行收集所有模块（每个模块独立容错）
  const results: FileResult[] = [];

  // ===== Universe =====
  if (scope.universeId) {
    const [canonRes, graphRes] = await Promise.all([
      safeRun("universe/canon.json", "application/json", async () => {
        const data = await fetchUniverseCanon(scope.universeId!);
        return jsonStringify(data);
      }),
      safeRun("universe/character-graph.json", "application/json", async () => {
        const data = await fetchCharacterGraph(scope.universeId!);
        return jsonStringify(data);
      }),
    ]);
    results.push(canonRes, graphRes);
  } else {
    results.push(
      { kind: "missing", path: "universe/canon.json", reason: "项目未关联 Universe" },
      { kind: "missing", path: "universe/character-graph.json", reason: "项目未关联 Universe" },
    );
  }

  // ===== Characters =====
  const [passportsRes, voiceProfilesRes] = await Promise.all([
    safeRun("characters/passports.json", "application/json", async () => {
      const data = await fetchCharacterPassports(ownerId, projectId);
      return jsonStringify(data);
    }),
    safeRun("characters/voice-profiles.json", "application/json", async () => {
      const data = await fetchVoiceProfiles(ownerId, projectId);
      return jsonStringify(data);
    }),
  ]);
  results.push(passportsRes, voiceProfilesRes);

  // ===== Script =====
  const [episodeRes, scenesRes] = await Promise.all([
    safeRun("script/episode.md", "text/markdown", async () => {
      const data = await fetchScriptEpisode(ownerId, projectId, sourceUnitId);
      if (!data) return null;
      const md = `# ${data.title}\n\nProject: \`${data.projectId}\`\nSource Unit: \`${data.sourceUnitId}\`\n\n---\n\n${data.contentMd}`;
      return md;
    }),
    safeRun("script/scenes.json", "application/json", async () => {
      const data = await fetchScenes(ownerId, projectId, scope.productionProjectId);
      return jsonStringify(data);
    }),
  ]);
  results.push(episodeRes, scenesRes);

  // ===== Director =====
  const [shotListRes, promptsRes] = await Promise.all([
    safeRun("director/shot-list.csv", "text/csv", async () => {
      const data = await fetchDirectorShotList(ownerId, projectId, scope.productionProjectId);
      return data.csv;
    }),
    safeRun("director/prompts.json", "application/json", async () => {
      const data = await fetchDirectorPrompts(ownerId, projectId, scope.productionProjectId);
      return jsonStringify(data);
    }),
  ]);
  results.push(shotListRes, promptsRes);

  // ===== Media =====
  const [takesRes, voiceLinesRes, assetsRes] = await Promise.all([
    safeRun("media/selected-takes.json", "application/json", async () => {
      const data = await fetchSelectedTakes(ownerId, projectId);
      return jsonStringify(data);
    }),
    safeRun("media/voice-lines.json", "application/json", async () => {
      const data = await fetchVoiceLines(ownerId, projectId);
      return jsonStringify(data);
    }),
    safeRun("media/assets.json", "application/json", async () => {
      const data = await fetchAssets(ownerId, projectId);
      return jsonStringify(data);
    }),
  ]);
  results.push(takesRes, voiceLinesRes, assetsRes);

  // ===== Assembly =====
  const assemblyRes = await safeRun("assembly/kiikis.timeline.json", "application/json", async () => {
    const data = await fetchAssemblyTimeline(ownerId, projectId, sourceUnitId, aspectRatio);
    if (!data) return null;
    return jsonStringify(data);
  });
  results.push(assemblyRes);

  // ===== Evidence =====
  const evidenceRes = await safeRun("evidence/generation-jobs.json", "application/json", async () => {
    const data = await fetchGenerationJobs(ownerId, projectId);
    return jsonStringify(data);
  });
  results.push(evidenceRes);

  // 3. 装配 entries 和 files
  const entries: ManifestEntry[] = [];
  const files: ProductionPackage["files"] = [];
  for (const r of results) {
    const { entry, file } = toEntryAndFile(r);
    entries.push(entry);
    if (file) files.push(file);
  }

  // 4. 构造 manifest
  const manifest = buildManifest({
    projectId,
    sourceUnitId,
    universeId: scope.universeId,
    productionProjectId: scope.productionProjectId,
    exportedByUserId: ownerId,
    entries,
  });

  // 5. 将 manifest 自身作为包内第一个文件
  const manifestJson = jsonStringify(manifest);
  const manifestFile = { path: "manifest.json", content: manifestJson, mimeType: "application/json" };

  return {
    package: {
      manifest,
      files: [manifestFile, ...files],
    },
    manifest,
  };
}
