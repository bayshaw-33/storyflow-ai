import { NextResponse } from "next/server";
import { callMiniMax } from "@/lib/ai/providers/minimax";
import { normalizeArtActions } from "@/lib/art/actions";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";
import { authenticateRequest } from "@/lib/supabase/server";

type ChatRequest = {
  message?: string;
  projectTitle?: string;
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
    const saved = await resolveSavedApiConfig(user.id, "minimax").catch(() => null);
    const attachments = (body.attachments || []).filter((attachment) => attachment.kind === "image" && attachment.url?.startsWith("http"));
    const userContent = JSON.stringify({ projectTitle: body.projectTitle || "美术项目", message, attachments: body.attachments || [], assets: (body.assets || []).slice(0, 80) });
    const result = await callMiniMax({
      apiKeyOverride: saved?.minimaxApiKey,
      modelOverride: saved?.minimaxModel,
      baseUrlOverride: saved?.minimaxBaseUrl,
      temperature: 0.25,
      maxTokens: 3000,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: attachments.length ? [{ type: "text", text: userContent }, ...attachments.map((attachment) => ({ type: "image_url" as const, image_url: { url: attachment.url! } }))] : userContent },
      ],
    });
    const parsed = parseJson(result.output);
    return NextResponse.json({ success: true, assistantText: String(parsed.assistantText || "已整理您的美术修改。"), actions: normalizeArtActions(parsed.actions), provider: result.provider, model: result.model, error: null });
  } catch (error) {
    if (isAuthError(error)) return failure("请先登录后再使用 KK 美术助理。", 401);
    const fallback = fallbackReply(message);
    return NextResponse.json({ success: true, ...fallback, provider: "local", model: "art-intent-fallback", warning: "AI 暂时不可用，已按明确指令创建草稿。", error: null });
  }
}

function systemPrompt() {
  return `你是 Kiikis 的 KK 美术统筹助理。根据用户自然语言管理角色、场景和关键道具仓库。只输出 JSON：{"assistantText":"简短反馈","actions":[]}。
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
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as { assistantText?: string; actions?: unknown };
}

function fallbackReply(message: string) {
  const match = message.match(/增加(?:两个|2个|两名|2名).*?(配角|角色)/);
  if (match) {
    return {
      assistantText: "已增加两名相关配角草稿，您可以继续修改姓名、叙事功能和视觉方向。",
      actions: normalizeArtActions([
        { type: "create_asset", kind: "character", name: "新配角 A", narrativeRole: "重要配角", description: message },
        { type: "create_asset", kind: "character", name: "新配角 B", narrativeRole: "重要配角", description: message },
      ]),
    };
  }
  return { assistantText: "我已收到要求。请指定要修改的角色、场景或道具名称。", actions: [] };
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, assistantText: "", actions: [], error }, { status });
}
