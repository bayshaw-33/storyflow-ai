/**
 * KIIKIS V2.2 剧本→美术→分镜→视频 谱系融合 — Phase 5 Task 5.3.
 *
 * 核心规则：
 *   - 同一 projectId 下 Art/Storyboard/Video 各拥有独立且稳定的 workId
 *   - 剧本场→美术试做自动创建 source Checkpoint（锁定剧本版本）
 *   - 每个下游节点持有 sourceWorkId + sourceVersionId，可一路回溯到剧本
 *   - 上游变化不删除下游：标 stale，可继续旧版或新建候选
 *   - 视频 Provider URL 只用于 ingestion；ready 后 Asset Version 指向持久 storage
 *
 * 纯逻辑模块（无 I/O），供 node --test 直接测试。
 */

export type ChainKind = "art" | "storyboard" | "video" | "storyboard_candidate";

export interface ChainNode {
  kind: ChainKind;
  workId: string;
  projectId: string;
  sourceWorkId: string | null;
  sourceVersionId: string | null;
  checkpointId: string | null;
  stale: boolean;
  ready: boolean;
}

export const SCREENPLAY_WORK_ID = "work:screenplay";

/** 同一 projectId 下，每种工作流拥有独立且稳定的 workId。 */
export function deriveWorkId(projectId: string, kind: "art" | "storyboard" | "video"): string {
  return `${projectId}:${kind}`;
}

/**
 * 剧本场→下游试做：自动创建 source Checkpoint（锁定剧本版本）。
 * 只允许从剧本（screenplay）出发。
 */
export function fromScriptScene(input: {
  kind: "art" | "storyboard" | "video";
  projectId: string;
  sceneId: string;
  sceneVersionId: string;
}): ChainNode {
  if (input.kind === "storyboard") {
    // 分镜可直接从剧本场建立；美术/视频也可，但语义上 storyboard 也从剧本出发
  }
  if (!input.sceneVersionId) {
    throw new Error("fromScriptScene: 需要剧本版本（sceneVersionId）才能建立 Checkpoint。");
  }
  return {
    kind: input.kind,
    workId: deriveWorkId(input.projectId, input.kind),
    projectId: input.projectId,
    sourceWorkId: SCREENPLAY_WORK_ID,
    sourceVersionId: input.sceneVersionId,
    checkpointId: `checkpoint:${input.sceneId}:${input.sceneVersionId}`,
    stale: false,
    ready: false,
  };
}

export interface ChainLinkInput {
  projectId: string;
  art: { workId: string; sourceVersionId: string };
  storyboard: { workId: string; sourceWorkId: string; sourceVersionId: string };
  video: { workId: string; sourceWorkId: string; sourceVersionId: string };
}

/** 构建完整谱系链：art ← 剧本；storyboard ← art；video ← storyboard。 */
export function buildChain(input: ChainLinkInput): ChainNode[] {
  const art: ChainNode = {
    kind: "art",
    workId: input.art.workId,
    projectId: input.projectId,
    sourceWorkId: SCREENPLAY_WORK_ID,
    sourceVersionId: input.art.sourceVersionId,
    checkpointId: null,
    stale: false,
    ready: false,
  };
  const storyboard: ChainNode = {
    kind: "storyboard",
    workId: input.storyboard.workId,
    projectId: input.projectId,
    sourceWorkId: input.storyboard.sourceWorkId,
    sourceVersionId: input.storyboard.sourceVersionId,
    checkpointId: null,
    stale: false,
    ready: false,
  };
  const video: ChainNode = {
    kind: "video",
    workId: input.video.workId,
    projectId: input.projectId,
    sourceWorkId: input.video.sourceWorkId,
    sourceVersionId: input.video.sourceVersionId,
    checkpointId: null,
    stale: false,
    ready: false,
  };
  return [art, storyboard, video];
}

/**
 * 上游产生新版本：直接下游标 stale，保留旧版本引用；绝不删除。
 * 返回新链（不修改入参）。
 */
export function markUpstreamChanged(input: {
  chain: ChainNode[];
  upstreamWorkId: string;
  newUpstreamVersionId: string;
}): ChainNode[] {
  return input.chain.map((node) => {
    if (node.sourceWorkId === input.upstreamWorkId && node.kind !== "storyboard_candidate") {
      return { ...node, stale: true };
    }
    return node;
  });
}

/**
 * 处置 stale：
 *   - keep_old：接受旧版本，清除 stale 标记
 *   - new_candidate：保留原产物，新增 storyboard_candidate 节点指向新上游
 */
export function resolveStale(input: {
  chain: ChainNode[];
  workId: string;
  resolution: "keep_old" | "new_candidate";
  newSourceVersionId?: string;
}): ChainNode[] {
  const chain = input.chain.map((node) =>
    node.workId === input.workId && node.kind !== "storyboard_candidate"
      ? { ...node, stale: input.resolution === "keep_old" ? false : node.stale }
      : node,
  );
  if (input.resolution === "new_candidate" && input.newSourceVersionId) {
    const target = input.chain.find((n) => n.workId === input.workId && n.kind !== "storyboard_candidate");
    if (target) {
      chain.push({
        ...target,
        kind: "storyboard_candidate",
        workId: `${target.workId}:candidate`,
        sourceVersionId: input.newSourceVersionId,
        stale: true,
        checkpointId: null,
      });
    }
  }
  return chain;
}

export interface VideoJobBinding {
  shotId: string;
  storyboardVersionId: string;
  model: string;
  provider: string;
}

/** 视频 Job 绑定 Shot / Storyboard Version / Model / Provider。 */
export function videoJobBinding(input: VideoJobBinding): VideoJobBinding {
  if (!input.shotId || !input.storyboardVersionId || !input.model || !input.provider) {
    throw new Error("videoJobBinding: shotId/storyboardVersionId/model/provider 必填。");
  }
  return { ...input };
}

/** Provider 临时 URL（ingestion 阶段）vs 持久 CDN/storage URL。 */
export function isTemporaryProviderUrl(url: string): boolean {
  return /\/tasks\/|\/jobs\/|\/generate\//.test(url);
}

export interface FinalizedAsset {
  storagePath: string;
  temporaryUrl: null;
  ready: true;
}

/** ingestion 完成：Asset Version 指向持久 storage，丢弃临时 URL。 */
export function finalizeToPersistentStorage(input: {
  temporaryUrl: string;
  storagePath: string;
}): FinalizedAsset {
  if (!input.storagePath) throw new Error("finalizeToPersistentStorage: storagePath 必填。");
  return { storagePath: input.storagePath, temporaryUrl: null, ready: true };
}

// ---------------------------------------------------------------------------
// 美术谱系（Task 5.3 Step 2）
// ---------------------------------------------------------------------------

export type ArtKindScope = "character" | "scene" | "prop";

/** 角色/场景/道具只是美术资产类别，不产生新的顶级工作流。 */
export function artAssetKindScope(input: { kind: string }): { scope: ArtKindScope; workflow: "art" } {
  if (input.kind !== "character" && input.kind !== "scene" && input.kind !== "prop") {
    throw new Error(`artAssetKindScope: 非法美术类别 ${input.kind}（只接受 character/scene/prop）。`);
  }
  return { scope: input.kind, workflow: "art" };
}

export interface CharacterIdentityRef {
  characterId: string;
  characterName: string;
}

export interface WorkLocalAppearance {
  workId: string;
  assetVersionId: string;
  storagePath: string;
}

/**
 * Character Identity（跨 Work 稳定）与 Work Local Appearance（本 Work 的美术资产版本）分离。
 * identity 不含 storage path；appearance 不含 character id。
 */
export function separateCharacterIdentity(input: {
  characterId: string;
  characterName: string;
  asset: { id: string; projectId?: string | null; kind: string };
  assetVersion: { id: string; storagePath: string };
}): { identity: CharacterIdentityRef; localAppearance: WorkLocalAppearance } {
  const identity: CharacterIdentityRef = {
    characterId: input.characterId,
    characterName: input.characterName,
  };
  const localAppearance: WorkLocalAppearance = {
    workId: input.asset.projectId ?? "unknown",
    assetVersionId: input.assetVersion.id,
    storagePath: input.assetVersion.storagePath,
  };
  return { identity, localAppearance };
}
