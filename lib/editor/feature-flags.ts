/**
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * Feature Flag：控制 Editor Framework 是否启用
 *
 * env: EDITOR_FRAMEWORK_ENABLED = "true" | "false"（默认 false）
 */

export function isEditorFrameworkEnabled(): boolean {
  return process.env.EDITOR_FRAMEWORK_ENABLED === "true";
}

export function isOpenCutAvailable(): boolean {
  // 首期：OpenCut 永远不可用（仅框架）
  return false;
}

export function getOpenCutUnavailableReason(): string {
  return "OPENCUT_NOT_IMPLEMENTED";
}

/**
 * Export 按钮是否可用
 * 首期：仅当 Editor Framework 启用 + 有 completed 视频资产时可用
 */
export function isExportAvailable(input: {
  frameworkEnabled: boolean;
  hasCompletedVideo: boolean;
}): { available: boolean; reason?: string } {
  if (!input.frameworkEnabled) {
    return {
      available: false,
      reason: "EDITOR_FRAMEWORK_DISABLED",
    };
  }
  if (!input.hasCompletedVideo) {
    return {
      available: false,
      reason: "NO_COMPLETED_VIDEO_TAKE",
    };
  }
  return { available: true };
}
