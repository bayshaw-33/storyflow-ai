import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  fetchVoiceLineById,
  fetchVoiceProfileById,
  attachJobToVoiceLine,
  attachAssetToVoiceLine,
  markVoiceLineStatus,
} from "@/lib/voice/queries";
import {
  resolveTTSProvider,
  isTTSProviderAvailable,
  getCurrentTTSProviderName,
} from "@/lib/voice/provider";
import { persistVoiceLineArtifact } from "@/lib/voice/storage";

/**
 * POST /api/voice-lines/:voiceLineId/generate
 *
 * 触发 TTS 生成（TRAE-V2-03）。
 *
 * 流程：
 * 1. 鉴权 + 校验 voice line 归属
 * 2. 读取关联的 voice profile（必须 ready 或 draft）
 * 3. 检查 TTS Provider 可用性（不可用 → 422 PROVIDER_UNAVAILABLE）
 * 4. 创建 generation_job（job_type='audio', target_type='voice_line'）
 * 5. attachJobToVoiceLine + markVoiceLineStatus('generating')
 * 6. 调用 TTSProvider.submit
 * 7. 成功 → persistVoiceLineArtifact → insert asset → attachAssetToVoiceLine('generated')
 * 8. 失败 → markVoiceLineStatus('failed' / 'provider_timeout') + 更新 job 状态
 *
 * 安全：
 * - API Key 只走 env，不入库不进日志
 * - Provider 临时 URL 永不入库（同步 Provider 直接返回 bytes）
 * - 失败时不允许假成功
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ voiceLineId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { voiceLineId } = await context.params;
    const user = await authenticateRequest(request);

    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // 1. 校验 voice line 归属
    const voiceLine = await fetchVoiceLineById(serverClient, voiceLineId, user.id);
    if (!voiceLine) {
      return Response.json(
        { success: false, error: "Voice Line 不存在或无权访问。", requestId },
        { status: 404 },
      );
    }

    // 2. 读取 voice profile
    const profile = await fetchVoiceProfileById(
      serverClient,
      voiceLine.voiceProfileId,
      user.id,
    );
    if (!profile) {
      return Response.json(
        { success: false, error: "Voice Profile 不存在。", requestId },
        { status: 404 },
      );
    }
    if (profile.status === "archived") {
      return Response.json(
        { success: false, error: "Voice Profile 已归档，请先恢复后再生成。", requestId },
        { status: 422 },
      );
    }

    // 3. 检查 Provider 可用性
    if (!isTTSProviderAvailable()) {
      const providerName = getCurrentTTSProviderName();
      return Response.json(
        {
          success: false,
          error: `TTS Provider 未配置或不可用（当前: ${providerName}）。请联系管理员配置 TTS_PROVIDER 与对应 API Key。`,
          code: "PROVIDER_UNAVAILABLE",
          requestId,
        },
        { status: 422 },
      );
    }

    // 4. 创建 generation_job（复用 storyflow_generation_jobs）
    const jobInsert = {
      owner_id: user.id,
      job_type: "audio",
      provider: profile.voiceProvider,
      model: null,
      provider_task_id: null,
      prompt: voiceLine.text,
      input_params: {
        voice_line_id: voiceLine.id,
        voice_profile_id: profile.id,
        voice_provider_voice_id: profile.voiceProviderVoiceId,
        language: voiceLine.language,
        speed: profile.speed,
        pitch: profile.pitch,
        stability: profile.stability,
        style_prompt: profile.stylePrompt,
      } as Record<string, unknown>,
      status: "queued",
      error: null,
      result_url: null,
      result_metadata: {} as Record<string, unknown>,
      target_type: "voice_line",
      target_id: voiceLine.id,
      project_id: voiceLine.projectId ?? null,
    };

    const { data: jobRow, error: jobErr } = await serverClient
      .from("storyflow_generation_jobs")
      .insert(jobInsert)
      .select("id")
      .single();

    if (jobErr) throw jobErr;
    const jobId = (jobRow as { id: string }).id;

    // 5. 关联 job + 推进状态
    await attachJobToVoiceLine(serverClient, voiceLine.id, user.id, jobId, "generating");

    // 更新 job 状态为 running
    await serverClient
      .from("storyflow_generation_jobs")
      .update({ status: "running" })
      .eq("id", jobId);

    // 6. 调用 Provider
    const provider = await resolveTTSProvider();
    let submitResult;
    try {
      submitResult = await provider.submit({
        text: voiceLine.text,
        voiceProviderVoiceId: profile.voiceProviderVoiceId,
        language: voiceLine.language,
        speed: profile.speed,
        pitch: profile.pitch,
        stability: profile.stability,
        stylePrompt: profile.stylePrompt,
        ssml: voiceLine.ssml,
      });
    } catch (submitErr) {
      const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
      const isTimeout = msg.includes("PROVIDER_TIMEOUT") || msg.includes("timeout") || msg.includes("429");
      const status = isTimeout ? "provider_timeout" : "failed";
      await markVoiceLineStatus(serverClient, voiceLine.id, user.id, status, {
        error: msg.slice(0, 500),
      });
      await serverClient
        .from("storyflow_generation_jobs")
        .update({
          status: "failed",
          error: msg.slice(0, 500),
        })
        .eq("id", jobId);
      return Response.json(
        {
          success: false,
          error: isTimeout ? "Provider 超时，请稍后重试。" : `生成失败：${msg.slice(0, 200)}`,
          code: isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_FAILED",
          voiceLineId: voiceLine.id,
          jobId,
          requestId,
        },
        { status: isTimeout ? 504 : 502 },
      );
    }

    // 7. submit 成功 → 必须是同步结果（V1 只支持同步 Provider）
    if (submitResult.kind !== "sync_done") {
      // 异步 Provider 需要 poll，V1 不支持
      const msg = "ASYNC_PROVIDER_NOT_SUPPORTED_IN_V1";
      await markVoiceLineStatus(serverClient, voiceLine.id, user.id, "failed", {
        error: msg,
      });
      await serverClient
        .from("storyflow_generation_jobs")
        .update({ status: "failed", error: msg })
        .eq("id", jobId);
      return Response.json(
        { success: false, error: "V1 暂不支持异步 Provider。", requestId },
        { status: 422 },
      );
    }

    // 8. 转存到私有 Storage + 签名
    const { storagePath, signedUrl, expiresAt } = await persistVoiceLineArtifact({
      serverClient,
      userId: user.id,
      voiceLineId: voiceLine.id,
      bytes: submitResult.audioBytes,
      contentType: submitResult.contentType,
    });

    // 9. 创建 asset 记录
    const assetInsert = {
      user_id: user.id,
      project_id: voiceLine.projectId ?? null,
      asset_type: "audio",
      storage_path: storagePath,
      public_url: null, // 私有 bucket，不存公开 URL
      metadata: {
        voice_line_id: voiceLine.id,
        voice_profile_id: profile.id,
        provider: profile.voiceProvider,
        model: null,
        content_type: submitResult.contentType,
        byte_length: submitResult.audioBytes.byteLength,
        provider_metadata: submitResult.providerMetadata,
        source: "tts",
      } as Record<string, unknown>,
    };

    const { data: assetRow, error: assetErr } = await serverClient
      .from("storyflow_assets")
      .insert(assetInsert)
      .select("id")
      .single();

    if (assetErr) throw assetErr;
    const assetId = (assetRow as { id: string }).id;

    // 10. 关联 asset 到 voice line + 状态推进到 generated
    const updatedVoiceLine = await attachAssetToVoiceLine(
      serverClient,
      voiceLine.id,
      user.id,
      {
        assetId,
        storagePath,
        signedUrl,
        signedUrlExpiresAt: expiresAt,
        durationSeconds: undefined, // OpenAI TTS 不返回时长，前端解析
        providerMetadata: submitResult.providerMetadata,
      },
    );

    // 11. 完成 job
    await serverClient
      .from("storyflow_generation_jobs")
      .update({
        status: "completed",
        result_metadata: {
          asset_id: assetId,
          storage_path: storagePath,
          ...submitResult.providerMetadata,
        },
      })
      .eq("id", jobId);

    return ok({
      voiceLine: updatedVoiceLine,
      jobId,
      assetId,
      requestId,
    });
  } catch (error) {
    const errRes = apiError(error, "Voice Line 生成失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "Voice Line 生成失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
