/**
 * KIIKIS 2.1 Phase 2 — 确定性团队 Markdown 渲染 (Task 2.7)
 *
 * 同一 storyboard 输入必须字节级输出相同 Markdown。
 * 字段顺序固定（PRD §8）：镜头编号、时间点、人物名、台词、情绪、动作、运镜说明。
 *
 * 纯函数，无 IO、无 Date、无随机源，可直接用于服务端导出与前端预览。
 *
 * dialogue translation 是后期字段，不写入主 Markdown（由 exportDynamicGridJson 单独保留）。
 */

import type { DynamicGridSceneV1, DynamicGridFrameV1 } from "./dynamic-grid-contract.ts";

/** 团队 Markdown 渲染入参。 */
export interface RenderTeamMarkdownInput {
  /** 场景列表（按场顺序输出，每场一个章节）。 */
  scenes: ReadonlyArray<DynamicGridSceneV1>;
  /** 可选项目标题（写入文档头）。 */
  projectTitle?: string;
  /** 可选 handoff ID（写入文档头，便于溯源）。 */
  handoffId?: string;
}

/** 渲染单个 frame 为团队 Markdown 行（字段顺序固定）。 */
export function renderFrameMarkdown(frame: DynamicGridFrameV1): string {
  const lines: string[] = [];
  // 镜头编号 + 时间点 (PRD §8 字段顺序 1, 2)
  lines.push(`### #${frame.order} | ${frame.timecode}`);
  lines.push("");
  // 人物名 (字段顺序 3)
  lines.push(`- 人物：${frame.characterIds.length > 0 ? frame.characterIds.join(", ") : "—"}`);
  // 台词 (字段顺序 4) — dialogue 不烧录画面，仅用于导出
  lines.push(`- 台词：${frame.dialogue || "—"}`);
  // 情绪 (字段顺序 5)
  lines.push(`- 情绪：${frame.emotion || "—"}`);
  // 动作 (字段顺序 6)
  lines.push(`- 动作：${frame.action || "—"}`);
  // 运镜说明 (字段顺序 7) — 完整摄影提示词
  lines.push(`- 运镜：${frame.cameraMovement || "—"}`);
  // 附加字段 (景别 + 画面 + 锁定状态) — 不破坏主顺序
  lines.push(`- 景别：${frame.shotSize || "—"}`);
  lines.push(`- 画面：${frame.visualDescription || "—"}`);
  lines.push(`- 锁定：${frame.locked ? "是" : "否"}`);
  lines.push(`- 人工编辑：${frame.userEdited ? "是" : "否"}`);
  lines.push("");
  return lines.join("\n");
}

/** 渲染单个场景为团队 Markdown 章节。 */
export function renderSceneMarkdown(scene: DynamicGridSceneV1): string {
  const lines: string[] = [];
  lines.push(`## 场景 ${scene.sceneId}`);
  lines.push("");
  lines.push(`- 连续性：${scene.continuityMode}`);
  lines.push(`- 格数：${scene.gridCount}`);
  lines.push(`- 理由：${scene.gridRationale}`);
  lines.push(`- 轴线：${scene.spatialPlan.axis}`);
  lines.push(`- 入口：${scene.spatialPlan.entrances.join(", ")}`);
  lines.push(`- 屏幕方向：${scene.spatialPlan.screenDirections.join(", ")}`);
  lines.push(`- 共享摄影：${scene.sharedCinematography}`);
  lines.push(`- Negative Prompt：${scene.negativePrompt || "—"}`);
  lines.push("");
  lines.push(`### 镜头列表（共 ${scene.frames.length} 格）`);
  lines.push("");
  for (const frame of scene.frames) {
    lines.push(renderFrameMarkdown(frame));
  }
  return lines.join("\n");
}

/**
 * 渲染完整团队 Markdown 文档。
 *
 * 确定性保证：
 *   - 不读取系统时间、不生成随机数
 *   - 字段顺序在代码中固定
 *   - 数组按入参顺序遍历
 *   - 行尾统一使用 \n，文档以单个 \n 结尾
 */
export function renderTeamMarkdown(input: RenderTeamMarkdownInput): string {
  const lines: string[] = [];

  // 文档头
  const title = (input.projectTitle ?? "未命名项目").trim() || "未命名项目";
  lines.push(`# 动态宫格分镜团队交付 — ${title}`);
  lines.push("");
  if (input.handoffId) {
    lines.push(`- Handoff ID：${input.handoffId}`);
    lines.push("");
  }
  lines.push(`- 场景数：${input.scenes.length}`);
  const totalFrames = input.scenes.reduce((n, s) => n + s.frames.length, 0);
  lines.push(`- 镜头总数：${totalFrames}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 各场景
  for (const scene of input.scenes) {
    lines.push(renderSceneMarkdown(scene));
    lines.push("---");
    lines.push("");
  }

  // 确保文档以单个 \n 结尾（字节级确定性）
  return lines.join("\n").replace(/\n+$/, "") + "\n";
}
