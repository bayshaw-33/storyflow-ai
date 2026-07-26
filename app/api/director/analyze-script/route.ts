/**
 * POST /api/director/analyze-script
 * TRAE-V2-04 AI Director + Scene/Shot Breakdown
 * 分析剧本，返回 Scene/Shot Breakdown Preview（不写 DB）
 */

import { NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import { callRoutedProvider } from "@/lib/ai/providers";
import { ok } from "@/lib/api/responses";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";
import type { ByoApiConfig } from "@/lib/ai/prompts";
import { runDirectorBreakdown } from "@/lib/director/breakdown";
import type { DirectorDependencies } from "@/lib/director/breakdown";
import { isDirectorError } from "@/lib/director/types";
import type { DirectorBreakdownRequest } from "@/lib/director/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_INPUT", "请求格式不正确。");
  }

  if (!body || typeof body !== "object") {
    return errorResponse(400, "INVALID_INPUT", "请求格式不正确。");
  }

  const data = body as Record<string, unknown>;
  const source = typeof data.source === "string" ? data.source : "";
  const projectId = typeof data.projectId === "string" ? data.projectId : "";
  const sourceUnitId = typeof data.sourceUnitId === "string" ? data.sourceUnitId : "legacy";

  if (!source.trim() || !projectId.trim()) {
    return errorResponse(400, "INVALID_INPUT", "缺少必要参数：source / projectId。");
  }

  const aspectRatio = (typeof data.aspectRatio === "string" ? data.aspectRatio : "9:16") as "9:16" | "16:9" | "1:1";
  const targetDurationSeconds = typeof data.targetDurationSeconds === "number" ? data.targetDurationSeconds : 60;
  const visualStyle = typeof data.visualStyle === "string" ? data.visualStyle : "";
  const outputLanguage = (typeof data.outputLanguage === "string" ? data.outputLanguage : "zh-CN") as "zh-CN" | "en";
  const mode = (typeof data.mode === "string" ? data.mode : "full") as "full" | "scene";
  const sceneId = typeof data.sceneId === "string" ? data.sceneId : null;
  const lockedSceneIds = Array.isArray(data.lockedSceneIds) ? (data.lockedSceneIds as string[]) : [];
  const lockedShotIds = Array.isArray(data.lockedShotIds) ? (data.lockedShotIds as string[]) : [];

  const request_: DirectorBreakdownRequest = {
    projectId,
    sourceUnitId,
    source,
    aspectRatio,
    targetDurationSeconds,
    visualStyle,
    outputLanguage,
    mode,
    sceneId,
    lockedSceneIds,
    lockedShotIds,
  };

  try {
    const dependencies: DirectorDependencies = {
      callAI: async ({ systemPrompt, userPrompt }) => {
        try {
          let byoApi: ByoApiConfig | undefined;
          try {
            const saved = await resolveSavedApiConfig(userId);
            if (saved?.atlasModel) byoApi = { atlasModel: saved.atlasModel };
          } catch { /* 读不到就用默认配置 */ }

          const result = await callRoutedProvider({
            taskType: "storyboard_script",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            byoApi,
          });
          return {
            output: result.output,
            provider: {
              provider: result.provider,
              model: result.model,
              fallbackUsed: Boolean(result.fallbackUsed),
            },
          };
        } catch (err: unknown) {
          const rawDetail = err instanceof Error ? err.message.slice(0, 200) : String(err);
          console.error("[director/analyze-script] provider chain failed", { detail: rawDetail });
          throw new Error(rawDetail);
        }
      },
    };

    const response = await runDirectorBreakdown(dependencies, request_, { ownerId: userId });
    return ok(response);
  } catch (err: unknown) {
    if (isDirectorError(err)) {
      const status =
        err.code === "PROVIDER_TIMEOUT" ? 504 :
        err.code === "AI_CALL_FAILED" ? 502 :
        err.code === "AI_OUTPUT_INVALID" ? 422 :
        err.code === "INVALID_INPUT" ? 400 :
        500;
      return errorResponse(status, err.code, err.message, err.details);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "DIRECTOR_FAILED", message);
  }
}
