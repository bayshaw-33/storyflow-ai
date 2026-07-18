/**
 * PRD §4.1 / §8.1：唯一制作作用域。
 *
 * 所有四区（Script / Art / Storyboard / Video）必须共享同一 ProductionScope。
 * ownerId 只来自服务端认证；projectId + sourceUnitId 必须同时存在并写入 URL；
 * universeId 可以在未归档草稿阶段为空，但归档时必须明确选择绑定模式。
 *
 * 本模块是纯类型 + 纯函数，可在 .mjs 测试中直接 import。
 */

export type ProductionScope = {
  ownerId: string;
  universeId: string | null;
  projectId: string;
  sourceUnitId: string;
  revision: number;
};

export type ProductionScopeStatus =
  | "empty"
  | "draft"
  | "missing_project"
  | "missing_unit"
  | "valid";

/**
 * 判定当前 scope 状态。
 * - empty：projectId 和 sourceUnitId 都没有（入口空状态）
 * - draft：projectId 以 draft- 开头（未归档草稿，只能本地保存，云端操作需先归档）
 * - missing_project / missing_unit：只有一半 scope（非法状态）
 * - valid：完整非草稿 scope，可执行所有云端操作
 */
export function getProductionScopeStatus(
  projectId: string,
  sourceUnitId: string,
): ProductionScopeStatus {
  if (!projectId && !sourceUnitId) return "empty";
  if (projectId.startsWith("draft-")) return "draft";
  if (!projectId) return "missing_project";
  if (!sourceUnitId) return "missing_unit";
  return "valid";
}

/**
 * PRD §8.1：无合法 scope 时生成、保存、导出和证据按钮 fail-closed。
 * "合法"指 projectId + sourceUnitId 都存在（含 draft——draft 可触发归档保存）。
 * 云端生成/导出类操作应额外用 isCloudActionable 排除 draft。
 */
export function isScopeActionable(
  projectId: string,
  sourceUnitId: string,
): boolean {
  const status = getProductionScopeStatus(projectId, sourceUnitId);
  return status === "valid" || status === "draft";
}

/**
 * 云端操作（视频生成、证据包、生产包导出）需要已归档的正式 scope，
 * draft 草稿必须先归档才能执行。
 */
export function isCloudActionable(
  projectId: string,
  sourceUnitId: string,
): boolean {
  return getProductionScopeStatus(projectId, sourceUnitId) === "valid";
}
