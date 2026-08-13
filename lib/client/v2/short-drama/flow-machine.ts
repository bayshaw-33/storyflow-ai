// 短剧流 5 阶段状态机纯函数（K2-T-08）。
//
// 规则：
// - 阶段顺序固定：剧本 → 美术 → 分镜 → 视频 → 导出
// - locked 阶段不可直接进入，需等前置完成
// - available 阶段可自由进入（前置已完成但本阶段未开始）
// - completed 阶段可回看
// - 同一时间最多一个 current
//
// 资产跨阶段传递：剧本确认的候选 → 美术资产来源 → 分镜场景引用 → 视频镜头引用
// 回流候选：阶段完成后生成 Universe Change Proposal（draft 状态，不自动改写 Canon）
//
// 全部为纯函数，不依赖 DOM / fetch，便于 Node 测试直接导入。

import type {
  ArtAsset,
  AssetFlowRecord,
  ConfirmedAssets,
  ExportAndSubmitPayload,
  InheritanceSnapshotBundle,
  ProposalSubmitInput,
  RecoveryPoint,
  ScriptCandidate,
  ShortDramaData,
  ShortDramaProposal,
  ShortDramaSnapshotPayload,
  ShortDramaStageId,
  ShortDramaStageStatus,
  ShortDramaStages,
  SnapshotEntity,
} from "./types.ts";
import { STAGE_ORDER } from "./types.ts";

// 阶段中文标签（供外壳步骤导航展示）。
export const STAGE_LABELS_ZH: Record<ShortDramaStageId, string> = {
  script: "剧本",
  art: "美术",
  storyboard: "分镜",
  video: "视频",
  export: "导出",
};

export const STAGE_LABELS_EN: Record<ShortDramaStageId, string> = {
  script: "Script",
  art: "Art",
  storyboard: "Storyboard",
  video: "Video",
  export: "Export",
};

// 获取阶段在顺序中的索引。
export function getStageIndex(stageId: ShortDramaStageId): number {
  return STAGE_ORDER.indexOf(stageId);
}

// 获取某阶段的直接前置阶段（剧本无前置）。
export function getPreviousStage(stageId: ShortDramaStageId): ShortDramaStageId | null {
  const idx = getStageIndex(stageId);
  if (idx <= 0) return null;
  return STAGE_ORDER[idx - 1];
}

/**
 * 校验阶段状态机一致性：
 * - 至少一个阶段
 * - 最多一个 current
 * - locked 阶段的前置不能全部 completed（否则锁定无意义）
 * - current 阶段之前的阶段应已 completed（current 是进度前沿）
 */
export function validateFlowStages(stages: ShortDramaStages): {
  valid: boolean;
  reason?: string;
} {
  const stageIds = STAGE_ORDER;
  const currentCount = stageIds.filter((id) => stages[id].status === "current").length;
  if (currentCount > 1) {
    return { valid: false, reason: "multiple_current" };
  }
  // locked 阶段的前置不能全部 completed
  for (const id of stageIds) {
    if (stages[id].status === "locked") {
      const prev = getPreviousStage(id);
      if (prev !== null && stages[prev].status === "completed") {
        // 前置 completed 但本阶段 locked：不合理（应为 available 或 current 或 completed）
        return { valid: false, reason: "locked_after_completed_predecessor" };
      }
    }
  }
  return { valid: true };
}

// 判断是否可进入目标阶段（completed/current/available 可进入，locked 不可）。
export function canEnterStage(stages: ShortDramaStages, targetId: ShortDramaStageId): boolean {
  const target = stages[targetId];
  if (!target) return false;
  return target.status === "completed" || target.status === "current" || target.status === "available";
}

// 获取阶段进入被拒原因（供 UI 提示）。
export function getStageDenialReason(
  stages: ShortDramaStages,
  targetId: ShortDramaStageId,
  locale: string,
): string | null {
  const target = stages[targetId];
  if (!target) return null;
  if (target.status === "locked") {
    const prev = getPreviousStage(targetId);
    const prevLabel = prev
      ? (locale === "zh-CN" ? STAGE_LABELS_ZH[prev] : STAGE_LABELS_EN[prev])
      : "";
    return locale === "zh-CN"
      ? `该阶段尚未解锁，请先完成${prevLabel}阶段。`
      : `This stage is locked. Complete the ${prevLabel} stage first.`;
  }
  return null;
}

// 获取当前阶段（current 状态）。
export function getCurrentStage(stages: ShortDramaStages): ShortDramaStageId | null {
  for (const id of STAGE_ORDER) {
    if (stages[id].status === "current") return id;
  }
  return null;
}

// 获取各阶段状态列表（供步骤导航）。
export function getStageStatusList(stages: ShortDramaStages): {
  id: ShortDramaStageId;
  status: ShortDramaStageStatus;
}[] {
  return STAGE_ORDER.map((id) => ({ id, status: stages[id].status }));
}

function setStageStatus(
  stages: ShortDramaStages,
  stageId: ShortDramaStageId,
  status: ShortDramaStageStatus,
): ShortDramaStages {
  return {
    ...stages,
    [stageId]: { ...stages[stageId], status },
  };
}

/**
 * 推进阶段：将当前阶段标记为 completed，下一阶段变为 current。
 * 仅纯计算，返回新的 stages 对象（不修改入参）。
 * 若已是最后阶段（export），则保持 completed 不再推进。
 */
export function advanceStage(stages: ShortDramaStages): ShortDramaStages {
  const current = getCurrentStage(stages);
  if (current === null) return stages;
  const idx = getStageIndex(current);
  const next = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  const nextStages = setStageStatus(stages, current, "completed");
  return next === null ? nextStages : setStageStatus(nextStages, next, "current");
}

// 判断某阶段是否已完成。
export function isStageCompleted(stages: ShortDramaStages, stageId: ShortDramaStageId): boolean {
  return stages[stageId].status === "completed";
}

// 判断是否全部阶段已完成（用于触发回流候选生成）。
export function isFlowCompleted(stages: ShortDramaStages): boolean {
  return STAGE_ORDER.every((id) => stages[id].status === "completed");
}

// ─── 资产跨阶段传递 ───

/**
 * 从剧本阶段提取已确认资产集合。
 * 这是跨阶段传递的源头：角色/场景/道具 id。
 */
export function getConfirmedAssets(script: ShortDramaStages["script"]): ConfirmedAssets {
  return {
    characterIds: [...script.confirmed.characterIds],
    sceneIds: [...script.confirmed.sceneIds],
    propIds: [...script.confirmed.propIds],
  };
}

/**
 * 将剧本确认的候选传递到美术阶段：生成 pendingConfirm 列表。
 * 仅传递已确认的候选，未确认的不进入美术阶段。
 */
export function transferAssetsToArt(script: ShortDramaStages["script"]): ScriptCandidate[] {
  const all = [
    ...script.analysis.characters,
    ...script.analysis.scenes,
    ...script.analysis.props,
  ];
  const confirmedIds = new Set([
    ...script.confirmed.characterIds,
    ...script.confirmed.sceneIds,
    ...script.confirmed.propIds,
  ]);
  return all.filter((c) => confirmedIds.has(c.id));
}

/**
 * 校验美术阶段资产是否覆盖全部剧本确认的候选。
 * 用于美术阶段完成条件：每个已确认候选都应有对应美术资产且锁定主版本。
 */
export function isArtComplete(
  script: ShortDramaStages["script"],
  art: ShortDramaStages["art"],
): { complete: boolean; missing: string[] } {
  const expected = transferAssetsToArt(script);
  const missing: string[] = [];
  for (const candidate of expected) {
    const asset = art.assets.find((a) => a.sourceCandidateId === candidate.id);
    if (!asset || asset.mainVersionId === null) {
      missing.push(candidate.id);
    }
  }
  return { complete: missing.length === 0, missing };
}

/**
 * 构建资产流动记录：追踪每个确认候选流经的阶段。
 * 候选 → 美术资产 → 分镜引用 → 视频镜头引用。
 */
export function buildAssetFlow(data: ShortDramaData): AssetFlowRecord[] {
  const confirmed = getConfirmedAssets(data.stages.script);
  const allCandidates = [
    ...data.stages.script.analysis.characters,
    ...data.stages.script.analysis.scenes,
    ...data.stages.script.analysis.props,
  ];
  const records: AssetFlowRecord[] = [];
  const allConfirmedIds = [
    ...confirmed.characterIds,
    ...confirmed.sceneIds,
    ...confirmed.propIds,
  ];
  for (const id of allConfirmedIds) {
    const candidate = allCandidates.find((c) => c.id === id);
    if (!candidate) continue;
    const flow: ShortDramaStageId[] = ["script"];
    // 美术阶段：是否有对应资产
    const hasArt = data.stages.art.assets.some((a) => a.sourceCandidateId === id);
    if (hasArt) flow.push("art");
    // 分镜阶段：是否有帧引用该候选（场景候选）
    const hasStoryboard = data.stages.storyboard.frames.some((f) => f.sceneRef === id);
    if (hasStoryboard) flow.push("storyboard");
    // 视频阶段：是否有镜头引用对应分镜帧（间接引用）
    const frameIds = data.stages.storyboard.frames
      .filter((f) => f.sceneRef === id)
      .map((f) => f.id);
    const hasVideo = data.stages.video.shots.some((s) => frameIds.includes(s.frameRef));
    if (hasVideo) flow.push("video");
    records.push({
      candidateId: id,
      name: candidate.name,
      kind: candidate.kind,
      flow,
    });
  }
  return records;
}

// ─── 回流候选（Universe Change Proposal） ───

/**
 * 根据已完成阶段生成 Universe Change Proposal 候选。
 * 重要：候选状态为 "draft" 或 "pending_review"，不自动改写 Canon。
 * 仅当至少剧本阶段完成时才生成；全部完成时补充美术/视频来源的候选。
 */
export function generateProposals(data: ShortDramaData): ShortDramaProposal[] {
  const proposals: ShortDramaProposal[] = [];
  const { project, universeBinding, stages } = data;
  if (!universeBinding.bound || !universeBinding.universeId) return proposals;
  const universeId = universeBinding.universeId;
  const createdAt = project.lastSavedAt;

  // 剧本阶段完成：角色/场景/道具候选可作为 Universe 实体候选
  if (isStageCompleted(stages, "script")) {
    const confirmed = getConfirmedAssets(stages.script);
    const allCandidates = [
      ...stages.script.analysis.characters,
      ...stages.script.analysis.scenes,
      ...stages.script.analysis.props,
    ];
    for (const id of [...confirmed.characterIds, ...confirmed.sceneIds, ...confirmed.propIds]) {
      const candidate = allCandidates.find((c) => c.id === id);
      if (!candidate) continue;
      proposals.push({
        id: `prop-${project.id}-${id}`,
        universeId,
        sourceProjectId: project.id,
        sourceStage: "script",
        status: "pending_review",
        confidence: 0.8,
        fieldDiffs: [
          { path: `entities.${candidate.kind}.${candidate.name}`, before: null, after: candidate.summary },
        ],
        createdAt,
      });
    }
  }

  // 视频阶段完成：补充镜头证据候选
  if (isStageCompleted(stages, "video")) {
    for (const shot of stages.video.shots) {
      if (shot.status === "completed") {
        proposals.push({
          id: `prop-${project.id}-shot-${shot.id}`,
          universeId,
          sourceProjectId: project.id,
          sourceStage: "video",
          status: "draft",
          confidence: 0.6,
          fieldDiffs: [
            { path: `evidence.shots.${shot.id}`, before: null, after: shot.url ?? "completed" },
          ],
          createdAt,
        });
      }
    }
  }

  return proposals;
}

// ─── 中断恢复 ───

/**
 * 构建中断恢复点：记录当前阶段 + 已确认资产 + 时间戳。
 * 用于 localStorage 草稿，支持从任一中断点继续。
 */
export function buildRecoveryPoint(data: ShortDramaData): RecoveryPoint {
  const current = getCurrentStage(data.stages) ?? data.project.currentStage;
  return {
    stage: current,
    confirmedAssets: getConfirmedAssets(data.stages.script),
    lastSavedAt: data.project.lastSavedAt,
  };
}

/**
 * 从恢复点恢复阶段状态：将恢复点阶段设为 current，其后阶段锁定的保持锁定。
 * 返回新的 stages（不修改入参）。若恢复点阶段已完成，则推进到下一未完成阶段。
 */
export function restoreFromRecoveryPoint(
  stages: ShortDramaStages,
  recovery: RecoveryPoint,
): ShortDramaStages {
  let next: ShortDramaStages = { ...stages };
  const targetIdx = getStageIndex(recovery.stage);
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const id = STAGE_ORDER[i];
    if (i < targetIdx) {
      next = setStageStatus(next, id, "completed");
    } else if (i === targetIdx) {
      // 恢复点阶段：若已 completed 则保持，否则设为 current
      next = setStageStatus(next, id, stages[id].status === "completed" ? "completed" : "current");
    } else {
      // 后续阶段：前置若未完成则锁定
      const prevCompleted = next[STAGE_ORDER[i - 1]].status === "completed";
      next = setStageStatus(next, id, prevCompleted ? stages[id].status : "locked");
    }
  }
  return next;
}

// ─── 阶段完成条件 ───

/**
 * 各阶段完成条件判断。
 * 返回 { complete, reason } 用于 UI 展示下一步引导。
 */
export function getStageCompletion(
  stages: ShortDramaStages,
  stageId: ShortDramaStageId,
): { complete: boolean; reason: string; nextGuide: string | null } {
  const stage = stages[stageId];
  const isZh = true; // 默认中文，UI 层可覆盖
  switch (stageId) {
    case "script": {
      const confirmed = getConfirmedAssets(stages.script);
      const hasScript = stages.script.script.trim().length > 0;
      const hasConfirmed =
        confirmed.characterIds.length + confirmed.sceneIds.length + confirmed.propIds.length > 0;
      const complete = hasScript && hasConfirmed;
      return {
        complete,
        reason: !hasScript ? "请先输入或上传剧本" : !hasConfirmed ? "请至少确认一个候选" : "剧本阶段已完成",
        nextGuide: complete ? "进入美术阶段，为已确认角色/场景生成母版" : null,
      };
    }
    case "art": {
      const { complete, missing } = isArtComplete(stages.script, stages.art);
      return {
        complete,
        reason: missing.length > 0
          ? `还有 ${missing.length} 个候选未生成美术母版或未锁定主版本`
          : "美术阶段已完成",
        nextGuide: complete ? "进入分镜阶段，为已确认场景生成分镜帧" : null,
      };
    }
    case "storyboard": {
      const allConfirmed = stages.storyboard.frames.length > 0 &&
        stages.storyboard.frames.every((f) => f.confirmed);
      return {
        complete: allConfirmed,
        reason: stages.storyboard.frames.length === 0
          ? "请先生成分镜帧"
          : !allConfirmed
            ? "还有未确认的分镜帧"
            : "分镜阶段已完成",
        nextGuide: allConfirmed ? "进入视频阶段，将分镜转为镜头任务" : null,
      };
    }
    case "video": {
      const shots = stages.video.shots;
      const allCompleted = shots.length > 0 && shots.every((s) => s.status === "completed");
      const hasFailed = shots.some((s) => s.status === "failed");
      return {
        complete: allCompleted,
        reason: shots.length === 0
          ? "请先将分镜转为镜头任务"
          : hasFailed
            ? "存在失败的镜头，请重做或取消"
            : !allCompleted
              ? "还有 pending 镜头未完成"
              : "视频阶段已完成",
        nextGuide: allCompleted ? "进入导出阶段，生成制作证据包" : null,
      };
    }
    case "export": {
      const pkgs = stages.export.packages;
      const hasMissing = pkgs.some((p) => p.status === "missing" || p.status === "partial");
      const allReady = pkgs.length > 0 && pkgs.every((p) => p.status === "ready");
      return {
        complete: allReady,
        reason: pkgs.length === 0
          ? "请先生成导出清单"
          : hasMissing
            ? "存在缺失或部分缺失的导出包，未伪造为完整"
            : "导出阶段已完成",
        nextGuide: allReady ? "生成 Universe Change Proposal 候选，进入 Inbox 审核" : null,
      };
    }
    default:
      return { complete: false, reason: "未知阶段", nextGuide: null };
  }
}

// ─── 视频镜头任务派生 ───

/**
 * 从分镜帧派生视频镜头任务：每个已确认帧生成一个 pending 镜头。
 * 用于分镜 → 视频的跨阶段传递。
 */
export function deriveShotsFromStoryboard(storyboard: ShortDramaStages["storyboard"]): ShortDramaStages["video"]["shots"] {
  return storyboard.frames
    .filter((f) => f.confirmed)
    .map((f) => ({
      id: `shot-${f.id}`,
      frameRef: f.id,
      status: "pending" as const,
    }));
}

// 暴露 STAGE_ORDER 供外部引用。
export { STAGE_ORDER };

// ─── 端到端编排（K2-I-03） ───
//
// 以下三个纯函数用于把"剧本→导出→回流 Universe"端到端流程接起来：
// 1. buildScriptCandidatesFromSnapshot：从继承快照 payload 提取角色/场景/道具候选
// 2. buildExportAndSubmitPayload：根据已完成数据生成回流 payload + 证据引用
// 3. isE2EComplete：判断端到端流程是否完成
//
// 关键约束：
// - Universe 继承快照 payload.entities 用 type 字段（非 kind），对齐 C-03 服务端 toSnapshotDto
// - entity.type="character" → characters；"location" → scenes；"object" → props
// - 回流是候选（Change Proposal），suggestedAction 不直接 accept，由 Universe Inbox 审核
// - 证据引用必须是稳定引用（相对路径或内联标识），不依赖临时 URL

// Universe entity.type → 短剧候选 kind 映射。
// character/location/object 是 C-03 服务端落库的 type 字面值。
function entityKindToCandidateKind(type: string): "character" | "scene" | "prop" | null {
  switch (type) {
    case "character":
      return "character";
    case "location":
      return "scene";
    case "object":
      return "prop";
    default:
      return null;
  }
}

// 把单个 Universe entity 映射为 ScriptCandidate（无法识别的 type 返回 null）。
function mapEntityToCandidate(entity: SnapshotEntity): ScriptCandidate | null {
  const kind = entityKindToCandidateKind(entity.type);
  if (kind === null) return null;
  return {
    id: entity.id,
    name: entity.name,
    kind,
    summary: entity.summary,
  };
}

/**
 * 从继承快照 payload.entities 提取角色/场景/道具候选。
 * 用于 fetchShortDramaFlow 把云端继承快照映射到剧本阶段 analysis。
 *
 * 映射规则（对齐 C-03 toSnapshotDto 输出，payload.entities[].type）：
 * - type="character" → characters
 * - type="location"  → scenes
 * - type="object"    → props
 * - 其他 type 忽略（不视为剧本候选）
 *
 * 接受 InheritanceSnapshotBundle（完整快照）或 ShortDramaSnapshotPayload（仅 payload）。
 */
export function buildScriptCandidatesFromSnapshot(
  snapshotOrPayload: InheritanceSnapshotBundle | ShortDramaSnapshotPayload | null | undefined,
): { characters: ScriptCandidate[]; scenes: ScriptCandidate[]; props: ScriptCandidate[] } {
  const result = {
    characters: [] as ScriptCandidate[],
    scenes: [] as ScriptCandidate[],
    props: [] as ScriptCandidate[],
  };
  if (!snapshotOrPayload) return result;
  // 兼容完整快照与裸 payload 两种入参。
  const entities: SnapshotEntity[] =
    "payload" in snapshotOrPayload
      ? (snapshotOrPayload.payload?.entities ?? [])
      : (snapshotOrPayload.entities ?? []);
  for (const entity of entities) {
    const candidate = mapEntityToCandidate(entity);
    if (!candidate) continue;
    switch (candidate.kind) {
      case "character":
        result.characters.push(candidate);
        break;
      case "scene":
        result.scenes.push(candidate);
        break;
      case "prop":
        result.props.push(candidate);
        break;
    }
  }
  return result;
}

/**
 * 根据已完成的 ShortDramaData 生成回流 payload（proposals → C-04 ProposalInput）+ 证据引用。
 *
 * 返回结构供 submitProposalsToUniverse 使用：
 * - inputs：每个 ShortDramaProposal 转成一个 ProposalSubmitInput（含 idempotencyKey / target / proposedPayload）
 * - evidenceRefs：从导出包 contentRef 提取稳定证据引用（不依赖临时 URL）
 *
 * 关键约束：
 * - suggestedAction 固定 "review"（候选进入 Inbox 审核，不自动 accept）
 * - idempotencyKey 用 proposal.id + sourceProjectId 派生，确保重试幂等
 * - target.objectType 对齐候选 kind（character/scene/prop），objectId 用候选 id
 * - proposedPayload 写入候选 summary 与来源阶段，供 Inbox 展示
 * - 仅收集 status=ready 的导出包作为证据，partial/missing 不进证据链
 */
export function buildExportAndSubmitPayload(data: ShortDramaData): ExportAndSubmitPayload {
  const proposals = generateProposals(data);
  const inputs: ProposalSubmitInput[] = proposals.map((p) =>
    proposalToSubmitInput(p, data.project.id),
  );
  // 证据引用：仅 ready 导出包的 contentRef（已由 buildExportPackages 保证不依赖临时 URL）。
  const evidenceRefs: string[] = data.stages.export.packages
    .filter((pkg) => pkg.status === "ready")
    .map((pkg) => pkg.contentRef);
  return { inputs, evidenceRefs };
}

// 把 ShortDramaProposal 转成 C-04 ProposalSubmitInput。
function proposalToSubmitInput(
  proposal: ShortDramaProposal,
  projectId: string,
): ProposalSubmitInput {
  // 从 fieldDiffs 推断目标 object type：path 形如 entities.character.林晚 或 evidence.shots.xxx
  const firstPath = proposal.fieldDiffs[0]?.path ?? "";
  let objectType = "entity";
  if (firstPath.startsWith("entities.character")) objectType = "character";
  else if (firstPath.startsWith("entities.scene")) objectType = "scene";
  else if (firstPath.startsWith("entities.prop")) objectType = "prop";
  else if (firstPath.startsWith("evidence.")) objectType = "evidence";

  // proposedPayload：写入候选 after 值与来源阶段，供 Inbox 审核展示。
  const afterValue = proposal.fieldDiffs[0]?.after ?? null;
  const proposedPayload: Record<string, unknown> = {
    sourceStage: proposal.sourceStage,
    value: afterValue,
    confidence: proposal.confidence,
  };
  if (objectType !== "evidence") {
    proposedPayload.name = firstPath.split(".").pop() ?? "";
  }

  return {
    sourceProjectId: projectId,
    sourceStep: proposal.sourceStage,
    originalText: typeof afterValue === "string" ? afterValue : "",
    sourceReference: {
      kind: objectType === "evidence" ? "asset" : "text",
      label: `${proposal.sourceStage} 阶段候选 ${proposal.id}`,
    },
    confidence: proposal.confidence,
    fieldDiffs: proposal.fieldDiffs,
    // 候选进入 Inbox 审核，不自动 accept。
    suggestedAction: "review",
    // 用 proposal.id + projectId 派生幂等 key，重试同一候选不会重复创建。
    idempotencyKey: `short-drama:${projectId}:${proposal.id}`,
    target: { objectType, objectId: proposal.id },
    proposedPayload,
    // currentPayload 留空：候选为新增实体，无前置 payload 需要对比。
  };
}

/**
 * 判断端到端流程是否完成：
 * - 5 阶段全部 completed（isFlowCompleted）
 * - proposals 已生成（回流候选就绪，等待 submitProposalsToUniverse 提交）
 *
 * 注意：本函数只判断"端到端数据是否齐备"，不判断 proposals 是否已提交到云端
 * （是否已提交由 submitProposalsToUniverse 的返回值承载，调用方自行追踪）。
 */
export function isE2EComplete(data: ShortDramaData): boolean {
  if (!isFlowCompleted(data.stages)) return false;
  if (!Array.isArray(data.proposals) || data.proposals.length === 0) return false;
  return true;
}
