/**
 * POST /api/storyboard/analyze — strict storyboard analysis (read-only).
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * Flow: auth → service-role config → body/field validation (422) → AI call
 * (502 on failure) → strict parse (422 ANALYZE_OUTPUT_INVALID) → assemble →
 * merge with persisted shots → proposal response. NO database writes:
 * analysis is a proposal; persistence happens at Codex's save layer.
 */

import { NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import { loadProductionState } from "@/lib/production/api";
import { callRoutedProvider } from "@/lib/ai/providers";
import { ok } from "@/lib/api/responses";
import type { ProductionShot } from "@/lib/production/types";
import type {
  PersistedStoryboardScene,
  PersistedStoryboardShot,
} from "@/lib/storyboard/contracts";
import { runAnalyze } from "@/lib/storyboard/analyze";
import type { AnalyzeDependencies, ExistingStateScope } from "@/lib/storyboard/analyze/types";
import { parseAnalyzeJsonBody, validateAnalyzeRequest } from "@/lib/storyboard/analyze/schema";
import { isStoryboardError, StoryboardError } from "@/lib/storyboard/analyze/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(
  status: number,
  code: string,
  error: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

/** "5s" / "5" / 5 → 5; anything unparsable falls back to 4 seconds. */
function parseDurationSeconds(duration: unknown): number {
  if (typeof duration === "number" && Number.isFinite(duration)) return duration;
  if (typeof duration === "string") {
    const parsed = Number.parseFloat(duration.replace(/s$/i, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 4;
}

function mapShot(shot: ProductionShot, sceneId: string): PersistedStoryboardShot {
  return {
    id: shot.id,
    clientId: shot.id,
    idSource: "server",
    sceneId,
    order: shot.index,
    sourceText: shot.description,
    storyBeat: "",
    visualDescription: shot.description,
    characterAssetIds: shot.characterRefs ?? [],
    sceneAssetId: shot.sceneRefs?.[0] ?? null,
    propAssetIds: shot.sceneRefs?.slice(1) ?? [],
    shotSize: shot.composition || "中景",
    cameraMovement: shot.cameraMovement || "固定",
    angle: "平视",
    durationSeconds: parseDurationSeconds(shot.duration),
    dialogue: shot.dialogue ?? "",
    emotion: "",
    continuity: shot.continuity ?? "",
    imagePrompt: shot.imagePrompt ?? "",
    jimengPromptZh: shot.videoPrompt ?? "",
    // The production_shots table has no storyboard flags yet (Codex save
    // layer will persist them); until then nothing counts as preserved.
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: 1,
    analysisVersion: 1,
    sourceHash: "",
  };
}

/** Map the production backend (flat shot list) → persisted contract scenes. */
async function loadExistingState(scope: ExistingStateScope): Promise<{ scenes: PersistedStoryboardScene[] }> {
  const state = await loadProductionState(scope.ownerId, scope.projectId);
  if (!state) return { scenes: [] };

  const scenes: PersistedStoryboardScene[] = [];
  const byTitle = new Map<string, PersistedStoryboardScene>();
  for (const shot of state.shots) {
    const title = shot.sceneTitle?.trim() || "未分场";
    let scene = byTitle.get(title);
    if (!scene) {
      const sceneId = `srv_scene_${scenes.length + 1}`;
      scene = {
        id: sceneId,
        clientId: sceneId,
        idSource: "server",
        order: scenes.length + 1,
        heading: title,
        location: title,
        timeOfDay: "",
        summary: "",
        sourceText: "",
        characterAssetIds: [],
        propAssetIds: [],
        shots: [],
        locked: false,
        userEdited: false,
        confirmed: false,
        revision: 1,
        analysisVersion: 1,
        sourceHash: "",
      };
      byTitle.set(title, scene);
      scenes.push(scene);
    }
    const mapped = mapShot(shot, scene.id);
    scene.shots.push(mapped);
    scene.sourceText = scene.sourceText ? `${scene.sourceText}\n${mapped.sourceText}` : mapped.sourceText;
    scene.characterAssetIds = [...new Set([...scene.characterAssetIds, ...mapped.characterAssetIds])];
    scene.propAssetIds = [...new Set([...scene.propAssetIds, ...mapped.propAssetIds])];
  }
  return { scenes };
}

export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少 Supabase Service Role 配置。");
  }

  const parsedBody = parseAnalyzeJsonBody(await request.text());
  if (!parsedBody.ok) {
    return errorResponse(parsedBody.status, parsedBody.code, parsedBody.error);
  }
  const validated = validateAnalyzeRequest(parsedBody.value);
  if (!validated.ok) {
    return errorResponse(validated.status, validated.code, validated.error, validated.details);
  }

  try {
    const dependencies: AnalyzeDependencies = {
      callAI: async ({ systemPrompt, userPrompt }) => {
        try {
          const result = await callRoutedProvider({
            taskType: "storyboard_script",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
          });
          // PRD §5.2: 返回 output + provider 诊断（非敏感）
          return {
            output: result.output,
            provider: {
              provider: result.provider,
              model: result.model,
              fallbackUsed: Boolean(result.fallbackUsed),
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new StoryboardError("AI_CALL_FAILED", `AI 调用失败: ${message}`);
        }
      },
      loadExistingState: (scope) => loadExistingState(scope),
    };
    const response = await runAnalyze(dependencies, validated.value, { ownerId: userId });
    return ok(response);
  } catch (error) {
    if (isStoryboardError(error)) {
      const status =
        error.code === "SCENE_NOT_FOUND" || error.code === "ANALYZE_OUTPUT_INVALID"
          ? 422
          : error.code === "AI_CALL_FAILED"
            ? 502
            : 500;
      return errorResponse(status, error.code, error.message, error.details);
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "ANALYZE_FAILED", message);
  }
}
