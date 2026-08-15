/**
 * KIIKIS 任务 3：通用关联跳转能力。
 *
 * 封装"创作工作台 ↔ 制作工作台"之间的双向跳转判定逻辑，
 * 供 ProductionWorkbench / CreationWorkbench / 后续配音剪辑工作台复用。
 *
 * 关联作用域契约（与 RPC `save_storyboard_state` 对齐）：
 *   (owner_id, project_id, source_unit_id) 三元组唯一标识一份分镜状态。
 *
 * 跳转方向与判定：
 *   - creation → production：要求"项目已存在 + 当前有激活的剧本单元"
 *   - production → creation：要求"项目非草稿 + sourceUnitId 存在"
 *
 * 不引入运行时副作用（不读 localStorage、不调 RPC），只做纯函数判断。
 * 调用方负责传入上下文；本模块只决定"能否跳"以及"为什么不能跳"。
 */

export type WorkbenchSide = "creation" | "production" | "dub" | "edit";

export type JumpContext = {
  /** 当前项目 ID（draft- 前缀表示未归档草稿）。 */
  projectId?: string | null;
  /** 关联的创作单元 ID（创作工作台侧 activeUnit.id，制作工作台侧 URL 参数）。 */
  sourceUnitId?: string | null;
  /** 是否处于未命名草稿（draft- 前缀）状态。 */
  isDraft?: boolean;
  /** 创作工作台侧：是否有激活单元（activeUnit !== null）。 */
  hasActiveUnit?: boolean;
};

export type JumpResult = {
  ok: boolean;
  /** ok=false 时给出面向用户的原因；ok=true 时为 undefined。 */
  reason?: string;
};

/**
 * 创作工作台 → 制作工作台（分镜/视频）。
 *
 * 用于：CreationWorkbench 的"分镜/视频"按钮入口可见性与点击阻断。
 * 后续配音/剪辑工作台从创作侧进入时复用此函数。
 */
export function canJumpToProduction(ctx: JumpContext): JumpResult {
  const { projectId, sourceUnitId, isDraft, hasActiveUnit } = ctx;

  if (!projectId) {
    return { ok: false, reason: "请先选择或创建项目" };
  }
  // 草稿状态允许跳转（先创作后归档语义：制作侧会自动开未命名草稿）
  if (!hasActiveUnit && !sourceUnitId) {
    return { ok: false, reason: "请先选择或创建一集剧本，再进入分镜制作台" };
  }
  if (!isDraft && !sourceUnitId) {
    return { ok: false, reason: "未找到关联的剧本单元" };
  }
  return { ok: true };
}

/**
 * 制作工作台 → 创作工作台。
 *
 * 用于：ProductionWorkbench 的"返回创作"按钮入口可见性。
 * 后续配音/剪辑工作台跳回创作侧时复用此函数。
 */
export function canJumpToCreation(ctx: JumpContext): JumpResult {
  const { projectId, sourceUnitId, isDraft } = ctx;

  if (!projectId) {
    return { ok: false, reason: "当前没有项目，无法返回创作" };
  }
  if (isDraft || projectId.startsWith("draft-")) {
    return { ok: false, reason: "草稿尚未归档，请先保存项目再返回创作" };
  }
  if (!sourceUnitId) {
    return { ok: false, reason: "未关联创作单元，无法定位到剧本" };
  }
  return { ok: true };
}

/**
 * 通用入口：按方向分发到具体判定函数。
 *
 * 后续 dub/edit 工作台仅需传 side="dub"|"edit"，本函数会复用 creation↔production 的判定规则
 * （因为 dub/edit 在本期仅是 production 的占位 Tab，关联作用域与 production 一致）。
 */
export function canJump(from: WorkbenchSide, to: WorkbenchSide, ctx: JumpContext): JumpResult {
  if (from === "creation" && (to === "production" || to === "dub" || to === "edit")) {
    return canJumpToProduction(ctx);
  }
  if ((from === "production" || from === "dub" || from === "edit") && to === "creation") {
    return canJumpToCreation(ctx);
  }
  return { ok: false, reason: "不支持的跳转方向" };
}

/**
 * 构造跳转到制作工作台的 URL。
 * 仅在 canJumpToProduction 返回 ok=true 时调用。
 */
export function buildProductionJumpUrl(
  ctx: JumpContext,
  mode: "planning" | "art" | "editor" | "dub" | "edit" = "planning",
): string {
  const projectId = ctx.projectId || "";
  const sourceUnit = ctx.sourceUnitId || "";
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  if (sourceUnit) params.set("sourceUnitId", sourceUnit);
  if (mode !== "planning") params.set("mode", mode);
  return `/production?${params.toString()}`;
}

/**
 * 构造跳转到创作工作台的 URL。
 * 仅在 canJumpToCreation 返回 ok=true 时调用。
 */
export function buildCreationJumpUrl(ctx: JumpContext): string {
  const projectId = ctx.projectId || "";
  const sourceUnit = ctx.sourceUnitId || "";
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  if (sourceUnit) params.set("sourceUnitId", sourceUnit);
  return `/script-workbench?${params.toString()}`;
}
