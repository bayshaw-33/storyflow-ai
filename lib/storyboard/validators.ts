/**
 * Storyboard request validators.
 *
 * 从 app/api/storyboard/state/route.ts 抽出，使验证逻辑可在 Node.js 测试环境
 * 直接导入做运行时测试（route.ts 用 @/ alias 无法被 node --test 导入）。
 *
 * Codex MUST FIX: route-level regression test 需实际执行验证而非读源码。
 */

import type { SaveRequest } from "./contracts.ts";

/**
 * 验证 PUT /api/storyboard/state 的请求体。
 *
 * 关键：expectedRevision 必须是非负整数（Number.isInteger && >= 0）。
 * null / undefined / 负数 / 字符串均被拒绝——这是 P3 BLOCKER v2 移除 CAS bypass
 * 的核心验证点。
 */
export function isSaveRequest(value: unknown): value is SaveRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Boolean(
    typeof v.projectId === "string" && (v.projectId as string).trim() &&
      typeof v.sourceUnitId === "string" && (v.sourceUnitId as string).trim() &&
      Number.isInteger(v.expectedRevision) && (v.expectedRevision as number) >= 0 &&
      Array.isArray(v.scenes) &&
      Array.isArray(v.deletedSceneIds) &&
      Array.isArray(v.deletedShotIds),
  );
}
