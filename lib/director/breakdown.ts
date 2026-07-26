/**
 * TRAE-V2-04 AI Director Breakdown 编排层
 * - 调用 AI 生成 Scene + Shot Breakdown Preview
 * - 不写 DB，返回 Preview 由用户确认后 Apply
 * - 尊重 locked scene/shot（重新分析时不覆盖）
 */

import type {
  AiBreakdownOutput,
  AiSceneBreakdown,
  AiShotBreakdown,
  DirectorBreakdownRequest,
  DirectorBreakdownResponse,
  DirectorSceneMeta,
  DirectorShotMeta,
  SceneBreakdownPreview,
  ShotBreakdownPreview,
} from "./types.ts";
import { DirectorError } from "./types.ts";
import { buildDirectorSystemPrompt, buildDirectorUserPrompt, parseDirectorOutput } from "./prompts.ts";

// ============================================================
// AI 调用边界（route 注入真实实现，测试注入 mock）
// ============================================================

export type DirectorAIScope = {
  systemPrompt: string;
  userPrompt: string;
};

export type DirectorProviderInfo = {
  provider: string;
  model: string;
  fallbackUsed: boolean;
};

export type CallDirectorAI = (
  scope: DirectorAIScope,
) => Promise<string | { output: string; provider?: DirectorProviderInfo }>;

export type DirectorDependencies = {
  callAI: CallDirectorAI;
};

export type DirectorContext = {
  ownerId: string;
};

// ============================================================
// 主入口：runDirectorBreakdown
// ============================================================

export async function runDirectorBreakdown(
  deps: DirectorDependencies,
  request: DirectorBreakdownRequest,
  _context: DirectorContext,
): Promise<DirectorBreakdownResponse> {
  // 1. 构建 Prompt
  const systemPrompt = buildDirectorSystemPrompt();
  const userPrompt = buildDirectorUserPrompt(request);

  // 2. 调用 AI
  let rawOutput: string;
  let provider: DirectorProviderInfo | undefined;
  try {
    const result = await deps.callAI({ systemPrompt, userPrompt });
    if (typeof result === "string") {
      rawOutput = result;
    } else {
      rawOutput = result.output;
      provider = result.provider;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("timeout") || msg.includes("TIMEOUT");
    throw new DirectorError(
      isTimeout ? "PROVIDER_TIMEOUT" : "AI_CALL_FAILED",
      `AI 调用失败：${msg.slice(0, 200)}`,
    );
  }

  if (!rawOutput || !rawOutput.trim()) {
    throw new DirectorError("AI_CALL_FAILED", "AI 返回空输出");
  }

  // 3. 解析 JSON
  let parsed: unknown;
  try {
    parsed = parseDirectorOutput(rawOutput);
  } catch (err) {
    throw new DirectorError(
      "AI_OUTPUT_INVALID",
      `AI 输出 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4. 校验 schema
  const validated = validateBreakdownOutput(parsed);

  // 5. 组装 Preview
  const scenes = assemblePreviews(validated, request);

  return {
    analysisId: `director-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scenes,
    provider,
  };
}

// ============================================================
// Schema 校验
// ============================================================

function validateBreakdownOutput(raw: unknown): AiBreakdownOutput {
  if (!raw || typeof raw !== "object") {
    throw new DirectorError("AI_OUTPUT_INVALID", "AI 输出不是对象");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.scenes)) {
    throw new DirectorError("AI_OUTPUT_INVALID", "AI 输出缺少 scenes 数组");
  }
  return { scenes: obj.scenes.map(validateScene) };
}

function validateScene(raw: unknown): AiSceneBreakdown {
  if (!raw || typeof raw !== "object") {
    throw new DirectorError("AI_OUTPUT_INVALID", "Scene 项不是对象");
  }
  const s = raw as Record<string, unknown>;
  const required = ["heading", "location", "time_of_day", "summary", "source_text"];
  for (const key of required) {
    if (typeof s[key] !== "string" || !(s[key] as string).length) {
      throw new DirectorError("AI_OUTPUT_INVALID", `Scene 缺少字段 ${key}`);
    }
  }
  if (!Array.isArray(s.shots)) {
    throw new DirectorError("AI_OUTPUT_INVALID", `Scene ${s.heading} 缺少 shots 数组`);
  }
  return {
    heading: s.heading as string,
    location: s.location as string,
    time_of_day: s.time_of_day as string,
    summary: s.summary as string,
    source_text: s.source_text as string,
    characters: Array.isArray(s.characters) ? (s.characters as string[]) : [],
    props: Array.isArray(s.props) ? (s.props as string[]) : [],
    scene_function: typeof s.scene_function === "string" ? s.scene_function : "",
    conflict: typeof s.conflict === "string" ? s.conflict : "",
    emotion: typeof s.emotion === "string" ? s.emotion : "",
    value_shift: typeof s.value_shift === "string" ? s.value_shift : "",
    blocking: typeof s.blocking === "string" ? s.blocking : "",
    source_quote_range: normalizeRange(s.source_quote_range),
    shots: s.shots.map(validateShot),
  };
}

function validateShot(raw: unknown): AiShotBreakdown {
  if (!raw || typeof raw !== "object") {
    throw new DirectorError("AI_OUTPUT_INVALID", "Shot 项不是对象");
  }
  const s = raw as Record<string, unknown>;
  const required = ["source_text", "story_beat", "visual_description", "shot_size", "camera_movement", "angle"];
  for (const key of required) {
    if (typeof s[key] !== "string") {
      throw new DirectorError("AI_OUTPUT_INVALID", `Shot 缺少字段 ${key}`);
    }
  }
  const dur = typeof s.duration_seconds === "number" ? s.duration_seconds : Number(s.duration_seconds) || 5;
  return {
    source_text: s.source_text as string,
    story_beat: s.story_beat as string,
    visual_description: s.visual_description as string,
    characters: Array.isArray(s.characters) ? (s.characters as string[]) : [],
    location: typeof s.location === "string" ? s.location : null,
    props: Array.isArray(s.props) ? (s.props as string[]) : [],
    shot_size: s.shot_size as string,
    camera_movement: s.camera_movement as string,
    angle: s.angle as string,
    duration_seconds: Math.min(10, Math.max(2, dur)),
    dialogue: typeof s.dialogue === "string" ? s.dialogue : "",
    emotion: typeof s.emotion === "string" ? s.emotion : "",
    continuity: typeof s.continuity === "string" ? s.continuity : "",
    focal_length: typeof s.focal_length === "string" ? s.focal_length : "",
    blocking: typeof s.blocking === "string" ? s.blocking : "",
    camera_start: typeof s.camera_start === "string" ? s.camera_start : "",
    movement_path: typeof s.movement_path === "string" ? s.movement_path : "",
    speed_curve: typeof s.speed_curve === "string" ? s.speed_curve : "",
    parallax: typeof s.parallax === "string" ? s.parallax : "",
    focus_change: typeof s.focus_change === "string" ? s.focus_change : "",
    end_frame: typeof s.end_frame === "string" ? s.end_frame : "",
    transition_interface: typeof s.transition_interface === "string" ? s.transition_interface : "",
    lighting: typeof s.lighting === "string" ? s.lighting : "",
    color: typeof s.color === "string" ? s.color : "",
    sound_effects: typeof s.sound_effects === "string" ? s.sound_effects : "",
  };
}

function normalizeRange(raw: unknown): { start: number; end: number } {
  if (!raw || typeof raw !== "object") return { start: 0, end: 0 };
  const r = raw as Record<string, unknown>;
  return {
    start: typeof r.start === "number" ? r.start : Number(r.start) || 0,
    end: typeof r.end === "number" ? r.end : Number(r.end) || 0,
  };
}

// ============================================================
// 组装 Preview
// ============================================================

function assemblePreviews(
  output: AiBreakdownOutput,
  request: DirectorBreakdownRequest,
): SceneBreakdownPreview[] {
  const lockedSceneIds = new Set(request.lockedSceneIds ?? []);
  const lockedShotIds = new Set(request.lockedShotIds ?? []);

  return output.scenes.map((aiScene, sceneIdx): SceneBreakdownPreview => {
    const sceneId = `preview-scene-${sceneIdx + 1}-${Math.random().toString(36).slice(2, 8)}`;

    const directorMeta: DirectorSceneMeta = {
      scene_function: aiScene.scene_function,
      conflict: aiScene.conflict,
      emotion: aiScene.emotion,
      value_shift: aiScene.value_shift,
      blocking: aiScene.blocking,
      scene_assets: [],
      source_quote_range: aiScene.source_quote_range,
      ai_generated: true,
      user_confirmed: false,
    };

    const shots: ShotBreakdownPreview[] = aiScene.shots.map((aiShot, shotIdx): ShotBreakdownPreview => {
      const shotId = `preview-shot-${sceneIdx + 1}-${shotIdx + 1}-${Math.random().toString(36).slice(2, 8)}`;
      const shotDirectorMeta: DirectorShotMeta = {
        focal_length: aiShot.focal_length,
        blocking: aiShot.blocking,
        camera_start: aiShot.camera_start,
        movement_path: aiShot.movement_path,
        speed_curve: aiShot.speed_curve,
        parallax: aiShot.parallax,
        focus_change: aiShot.focus_change,
        end_frame: aiShot.end_frame,
        transition_interface: aiShot.transition_interface,
        lighting: aiShot.lighting,
        color: aiShot.color,
        sound_effects: aiShot.sound_effects,
        provider_params: {},
        ai_generated: true,
        user_confirmed: false,
      };

      return {
        shotId,
        sceneId,
        order: shotIdx + 1,
        sourceText: aiShot.source_text,
        storyBeat: aiShot.story_beat,
        visualDescription: aiShot.visual_description,
        shotSize: aiShot.shot_size,
        cameraMovement: aiShot.camera_movement,
        angle: aiShot.angle,
        durationSeconds: aiShot.duration_seconds,
        dialogue: aiShot.dialogue,
        emotion: aiShot.emotion,
        continuity: aiShot.continuity,
        directorMeta: shotDirectorMeta,
      };
    });

    return {
      sceneId,
      heading: aiScene.heading,
      location: aiScene.location,
      timeOfDay: aiScene.time_of_day,
      summary: aiScene.summary,
      sourceText: aiScene.source_text,
      characterAssetIds: [],
      propAssetIds: [],
      directorMeta,
      shots,
    };
  });
}

// ============================================================
// Locked 检查辅助
// ============================================================

export function filterLockedPreviews(
  previews: SceneBreakdownPreview[],
  lockedSceneIds: Set<string>,
  lockedShotIds: Set<string>,
): { kept: SceneBreakdownPreview[]; skipped: number } {
  // 已锁定的 scene/shot 在 preview 阶段就标记，apply 时跳过
  let skipped = 0;
  const kept = previews.map((scene) => {
    if (lockedSceneIds.has(scene.sceneId)) {
      skipped += 1;
      return null;
    }
    const filteredShots = scene.shots.filter((shot) => {
      if (lockedShotIds.has(shot.shotId)) {
        skipped += 1;
        return false;
      }
      return true;
    });
    return { ...scene, shots: filteredShots };
  }).filter((s): s is SceneBreakdownPreview => s !== null);
  return { kept, skipped };
}
