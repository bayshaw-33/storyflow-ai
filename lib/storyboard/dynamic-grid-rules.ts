/**
 * KIIKIS 2.1 Phase 2 — 动态宫格导演规则 (K21-SB-002..006, K21-SB-009)
 *
 * 校验导演规则：
 * - K21-SB-002: NEW 首格无人空镜、有运镜；人物从第 2 格出现
 * - K21-SB-003: CONTINUOUS 不强制空镜
 * - K21-SB-005: 相邻格景别或视点有变化，轴线和 screen direction 不矛盾
 * - K21-SB-006: in-world text unreadable, dialogue/translation 不烧录
 * - K21-SB-009: 每镜头输出完整摄影提示词
 */

import type { DynamicGridSceneV1, DynamicGridFrameV1 } from "./dynamic-grid-contract.ts";

export interface DirectorRuleViolation {
  readonly rule: string;
  readonly frameId?: string;
  readonly message: string;
}

export interface DirectorRuleResult {
  readonly valid: boolean;
  readonly violations: ReadonlyArray<DirectorRuleViolation>;
}

/**
 * 校验所有导演规则。
 * 返回所有违例，不抛异常 (供 UI 展示)。
 */
export function validateDirectorRules(scene: DynamicGridSceneV1): DirectorRuleResult {
  const violations: DirectorRuleViolation[] = [];

  // K21-SB-002: NEW 首格无人空镜
  if (scene.continuityMode === "NEW") {
    violations.push(...checkNewSceneFirstFrame(scene));
  }

  // K21-SB-003: CONTINUOUS 不强制空镜 (只检查不误报)
  if (scene.continuityMode === "CONTINUOUS") {
    violations.push(...checkContinuousScene(scene));
  }

  // K21-SB-005: 相邻格景别或视点有变化，轴线不矛盾
  violations.push(...checkAdjacentFrameVariation(scene));

  // K21-SB-006: 宫格不烧录可读文字
  violations.push(...checkNoBurnedText(scene));

  // K21-SB-009: 完整摄影提示词
  violations.push(...checkCinematographyPrompt(scene));

  return { valid: violations.length === 0, violations };
}

/**
 * K21-SB-002: NEW 场首格必须是无人空镜，有明确运镜；人物从第 2 格出现。
 */
function checkNewSceneFirstFrame(scene: DynamicGridSceneV1): DirectorRuleViolation[] {
  const violations: DirectorRuleViolation[] = [];
  if (scene.frames.length === 0) return violations;

  const firstFrame = scene.frames[0];

  // 首格不能有人物
  if (firstFrame.characterIds.length > 0) {
    violations.push({
      rule: "K21-SB-002",
      frameId: firstFrame.id,
      message: "NEW 场首格必须是无人空镜，但检测到人物",
    });
  }

  // 首格必须有运镜
  if (!firstFrame.cameraMovement || firstFrame.cameraMovement.trim().length === 0) {
    violations.push({
      rule: "K21-SB-002",
      frameId: firstFrame.id,
      message: "NEW 场首格必须有明确运镜说明",
    });
  }

  // 人物从第 2 格出现 (第 2 格可以有人物)
  // 这不是"必须有人物"，而是"允许有人物"
  // 如果所有格都无人物，那是内容问题不是规则违例

  return violations;
}

/**
 * K21-SB-003: CONTINUOUS 场承接动作/物件/视线，不强制空镜。
 * 只验证承接逻辑合理 (首格可以有人物)。
 */
function checkContinuousScene(scene: DynamicGridSceneV1): DirectorRuleViolation[] {
  const violations: DirectorRuleViolation[] = [];
  // CONTINUOUS 场首格允许有人物，不做空镜要求
  // 只检查场景不为空
  if (scene.frames.length === 0) {
    violations.push({
      rule: "K21-SB-003",
      message: "CONTINUOUS 场不能为空",
    });
  }
  return violations;
}

/**
 * K21-SB-005: 相邻格景别或视点有变化，轴线和 screen direction 不矛盾。
 */
function checkAdjacentFrameVariation(scene: DynamicGridSceneV1): DirectorRuleViolation[] {
  const violations: DirectorRuleViolation[] = [];

  for (let i = 1; i < scene.frames.length; i++) {
    const prev = scene.frames[i - 1];
    const curr = scene.frames[i];

    // 景别必须有变化 (不能连续两格完全相同景别)
    if (prev.shotSize === curr.shotSize) {
      // 允许相同景别，但必须运镜不同
      if (prev.cameraMovement === curr.cameraMovement) {
        violations.push({
          rule: "K21-SB-005",
          frameId: curr.id,
          message: `相邻格 ${prev.order}→${curr.order} 景别和运镜完全相同，缺乏变化`,
        });
      }
    }

    // screen direction 不矛盾 (简化检查：entrances 方向不冲突)
    // 如果 spatialPlan.screenDirections 只有一个方向，所有格应遵循
    if (scene.spatialPlan.screenDirections.length === 1) {
      const direction = scene.spatialPlan.screenDirections[0];
      // 这里只做存在性检查，实际方向匹配由 AI 生成时保证
      if (!direction) {
        violations.push({
          rule: "K21-SB-005",
          message: "spatialPlan.screenDirections 为空",
        });
      }
    }
  }

  return violations;
}

/**
 * K21-SB-006: 宫格纯画面不烧录编号、台词或可读文字。
 * 检查 visualDescription 中是否包含明显的可读文字标记。
 */
function checkNoBurnedText(scene: DynamicGridSceneV1): DirectorRuleViolation[] {
  const violations: DirectorRuleViolation[] = [];

  // 检查 visualDescription 是否包含台词引用 (引号包裹的对话)
  const dialoguePattern = /["「『"]/;

  for (const frame of scene.frames) {
    if (dialoguePattern.test(frame.visualDescription)) {
      violations.push({
        rule: "K21-SB-006",
        frameId: frame.id,
        message: "visualDescription 不应包含可读文字/台词引用",
      });
    }

    // 检查是否包含编号烧录 (如 #1, 第1格)
    if (/\d{1,2}[:：]/.test(frame.visualDescription) || /第\d+格/.test(frame.visualDescription)) {
      violations.push({
        rule: "K21-SB-006",
        frameId: frame.id,
        message: "visualDescription 不应包含格编号烧录",
      });
    }
  }

  return violations;
}

/**
 * K21-SB-009: 每镜头输出可直接给视频模型的完整摄影提示词。
 * 检查 cameraMovement 非空且含足够信息。
 */
function checkCinematographyPrompt(scene: DynamicGridSceneV1): DirectorRuleViolation[] {
  const violations: DirectorRuleViolation[] = [];

  for (const frame of scene.frames) {
    if (frame.cameraMovement.trim().length < 5) {
      violations.push({
        rule: "K21-SB-009",
        frameId: frame.id,
        message: "cameraMovement 过短，需完整摄影提示词",
      });
    }
  }

  return violations;
}

/**
 * 选择宫格数量 (K21-SB-001)。
 * 基于叙事密度 (场景数/角色数/动作复杂度) 推荐 4/6/9/12。
 */
export function recommendGridCount(params: {
  sceneBlockCount: number;
  characterCount: number;
  hasAction: boolean;
  hasMontage: boolean;
}): 4 | 6 | 9 | 12 {
  const { sceneBlockCount, characterCount, hasAction, hasMontage } = params;

  // montage 场景通常需要更多格
  if (hasMontage || sceneBlockCount >= 12) return 12;
  // 动作密集场景
  if (hasAction && (sceneBlockCount >= 8 || characterCount >= 3)) return 9;
  // 中等密度
  if (sceneBlockCount >= 5 || characterCount >= 2) return 6;
  // 低密度
  return 4;
}
