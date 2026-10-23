/**
 * POST /api/storyboard/prompts — deterministic per-shot prompt building.
 *
 * Task card: KIIKIS-P1-KIMI-002 §3
 *
 * Always HTTP 200 for well-formed requests: per-shot isolation means a
 * missing shot yields a {shotId, error, code:"SHOT_NOT_FOUND"} ITEM while
 * the other shots succeed.
 */

import { NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import { loadGenerationContext } from "@/lib/storyboard/generation-context";
import {
  parsePromptJsonBody,
  runPromptBuild,
  validatePromptRequest,
  type LoadedPromptShots,
  type LoadPromptShotsScope,
} from "@/lib/storyboard/prompts";
import { loadApprovedVersions } from "@/lib/storyboard/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

async function loadShots(scope: LoadPromptShotsScope): Promise<LoadedPromptShots> {
  return loadGenerationContext(scope, serviceFetch);
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

  const parsedBody = parsePromptJsonBody(await request.text());
  if (!parsedBody.ok) {
    return errorResponse(parsedBody.status, parsedBody.code, parsedBody.error);
  }
  const validated = validatePromptRequest(parsedBody.value);
  if (!validated.ok) {
    return errorResponse(validated.status, validated.code, validated.error, validated.details);
  }

  try {
    const result = await runPromptBuild(
      {
        loadShots,
        loadApprovedVersions: (assetIds) => loadApprovedVersions(serviceFetch, assetIds),
      },
      validated.value,
      { ownerId: userId },
    );
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "PROMPT_BUILD_FAILED", message);
  }
}
