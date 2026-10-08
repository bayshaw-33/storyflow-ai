import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/providers/deepseek";
import { normalizeArtActions } from "@/lib/art/actions";
import { artChatFallback, normalizeArtGeneration } from "@/lib/art/chat-intent";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  message?: string;
  projectTitle?: string;
  visualStyle?: string;
  sourceText?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  assets?: Array<{ id: string; kind: string; name: string; role?: string; description?: string }>;
  attachments?: Array<{ id: string; name: string; kind: string; url?: string }>;
};

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json() as ChatRequest;
  } catch {
    return failure("请求格式不正确。", 400);
  }
  const message = String(body.message || "").trim();
  if (!message) return failure("请输入美术修改要求。", 400);

  try {
    const user = await authenticateRequest(request);
    const saved = await resolveSavedApiConfig(user.id, "deepseek").catch(() => null);
    const userContent = JSON.stringify({ projectTitle: body.projectTitle || "美术项目", visualStyle: String(body.visualStyle || "").slice(0, 2000), sourceText: String(body.sourceText || "").slice(0, 16000), message, attachments: (body.attachments || []).map(({ id, name, kind }) => ({ id, name, kind })), assets: (body.assets || []).slice(0, 80) });
    const result = await callDeepSeek({
      apiKeyOverride: saved?.deepseekApiKey,
      modelOverride: saved?.deepseekModel,
      temperature: 0.25,
      maxTokens: 3000,
      messages: [
        { role: "system", content: systemPrompt() },
        ...(body.history || []).filter(item => (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-12).map(item => ({ role: item.role, content: item.content.slice(0, 4000) })),
        { role: "user", content: userContent },
      ],
    });
    const parsed = parseJson(result.output);
    return NextResponse.json({ success: true, assistantText: String(parsed.assistantText || "已整理您的美术修改。"), actions: normalizeArtActions(parsed.actions), generation: normalizeArtGeneration(parsed.generation, body.assets || []), provider: result.provider, model: result.model, degraded: false, error: null });
  } catch (error) {
    if (isAuthError(error)) return failure("请先登录后再使用 KK 美术助理。", 401);
    const fallback = artChatFallback(message);
    if (!fallback.generation) return failure(fallback.assistantText, 502);
    return NextResponse.json({ success: true, ...fallback, provider: "local", model: "art-intent-fallback", degraded: true, warning: "美术助理暂时不可用，使用你的原始要求生成，未进行提示词优化。", error: null });
  }
}

function systemPrompt() {
  return `你是 Kiikis 的 KK 美术统筹助理。根据当前项目资料和连续对话管理角色、场景和道具。只输出 JSON：{"assistantText":"简短反馈","actions":[],"generation":null}。
当用户明确要求生成、画图、修改图像或基于参考图创作时，输出 generation:{prompt:"完整可执行的图片提示词",assetId?:"现有资产ID",kind:"character|scene|prop",name:"简短资产名"}。提示词包含主体、动作、构图、光影、材质及保持参考身份/空间一致的要求，默认9:16，用户画幅选项最终优先。不要让用户自己去点击资产编辑器生图。
你是文本规划模型，未读取参考图像素。不要编造图片里的人物细节或声称已经看见；实际参考图由系统直接传给图片模型。缺少具体指令时追问。只是聊天/咨询/生成提示词或方案/新增文字资产/要求先不生成时 generation 必须 null。生成会付费，不擅自增加生成任务。图片真正完成前不得说“已生成”。不要覆盖已确认母版；生成都是新候选。
允许 action：
1. create_asset: {type,kind:"character|scene|prop",name,narrativeRole,description}
2. create_variant: {type,assetId,name,description}
3. update_asset: {type,assetId,patch:{name,narrativeRole,description,identityAnchor}}
4. attach_upload: {type,assetId?,uploadId,purpose:"master|candidate|reference"}
删除、覆盖终稿、更换 Universe、发布和撤回只能分别输出 delete_asset、replace_approved_version、change_universe、publish_asset、withdraw_asset，系统会要求确认。
如果用户要求增加多个角色，输出多个 create_asset。不要虚构不存在的 assetId。上传用途不明确时只在 assistantText 里追问，不输出 attach_upload。`;
}

function parseJson(output: string) {
  const cleaned = output.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as { assistantText?: string; actions?: unknown; generation?: unknown };
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, assistantText: "", actions: [], error }, { status });
}
