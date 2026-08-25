import type { ProjectDeletePreflight } from "./types.ts";

export function getCleanupCandidateLabel(preflight: Pick<ProjectDeletePreflight, "decision" | "relatedCounts">) {
  if (preflight.decision === "safe_to_delete") return "可永久删除";
  if (preflight.decision === "archive_only") return "建议归档";
  return "不可清理";
}

export function getCleanupCandidateSummary(preflight: Pick<ProjectDeletePreflight, "decision" | "reason" | "relatedCounts">) {
  if (preflight.decision === "safe_to_delete") return preflight.reason || "未发现创作内容或关联记录。";
  if (preflight.decision === "not_found") return preflight.reason || "项目不存在或你无权管理。";
  const total = Object.values(preflight.relatedCounts).reduce((sum, count) => sum + (Number(count) || 0), 0);
  return total > 0 ? `${preflight.reason || "项目含有内容或关联记录。"} ${total} 项关联记录。` : (preflight.reason || "项目含有创作内容，建议归档。");
}
