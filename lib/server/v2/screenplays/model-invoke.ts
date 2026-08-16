/**
 * Real model routing for the Screenplay Studio KK actions.
 *
 * discuss      → conversational reply (append-only, never edits content).
 * propose_change → strict-JSON candidate patches for per-hunk review.
 * similarity_review → structured similarity check report bound to the outline.
 *
 * Provider: DeepSeek (lib/ai/providers/deepseek.ts) with its built-in
 * flash→pro fallback. Missing credentials surface as provider errors —
 * never as deterministic fake replies.
 */

import { callDeepSeek } from "../../../ai/providers/deepseek.ts";
import type { AIMessage } from "../../../ai/providers/types.ts";
import type { CandidatePatch, ProposeScope } from "./generation.ts";

export type KkPurpose = "discuss" | "propose_change" | "similarity_review";

export interface KkInvokeContext {
  userMessage: string;
  purpose: KkPurpose;
  scope: ProposeScope | null;
  /** Context packet content digest (facts/entities/rules) or null. */
  packetContent: unknown;
  references: Array<{ type: string; id: string; versionId: string; reason: string }>;
  /** Recent conversation history (oldest first), used for continuity. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Current unit (type/title/body) the user is working on, when known. */
  unit: { type: string; title: string; body: string } | null;
  /** Free-form UI context: active tool/stage (drives KK focus). */
  clientContext?: string | null;
}

export interface KkInvokeResult {
  assistantText: string;
  patches: CandidatePatch[];
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_BODY_CHARS = 6000;
const MAX_PACKET_CHARS = 6000;

const UNIT_TYPE_LABELS: Record<string, string> = {
  world: "世界观",
  character: "角色圣经",
  outline: "剧情及大纲",
  episode: "分集计划",
  scene: "剧本正文（场）",
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…（已截断）`;
}

function serializePacket(ctx: KkInvokeContext): string {
  if (!ctx.packetContent) return "（暂无可用上下文包）";
  try {
    return truncate(JSON.stringify(ctx.packetContent, null, 0), MAX_PACKET_CHARS);
  } catch {
    return "（上下文包序列化失败）";
  }
}

function buildSystemPrompt(ctx: KkInvokeContext): string {
  const base = [
    "你是 KK，KIIKIS 剧本工作台的 AI 剧本伙伴。服务对象是 AI GC 导演和个人创作者。",
    "原则：",
    "1) 你永远不直接改写正文；修改必须以可审阅的候选块（patch）形式给出，用户逐块采用后才生效。",
    "2) 尊重既有设定与连续性；引用上下文时明确说明依据。",
    "3) 回复使用简体中文，直接、具体、可执行，不空谈。",
  ];
  if (ctx.unit) {
    base.push(`当前工作对象：${UNIT_TYPE_LABELS[ctx.unit.type] ?? ctx.unit.type}「${ctx.unit.title || "未命名"}」。`);
  }
  if (ctx.clientContext) {
    base.push(`用户当前所处工作阶段：${ctx.clientContext}。请围绕该阶段的目标回应。`);
  }
  base.push(`可用参考（Universe/版本引用）：${ctx.references.length ? ctx.references.map((r) => `${r.type}:${r.id}`).join("、") : "无"}`);
  return base.join("\n");
}

function buildContextBlock(ctx: KkInvokeContext): string {
  const parts: string[] = [`【上下文包】${serializePacket(ctx)}`];
  if (ctx.unit) {
    parts.push(`【当前文档内容】\n${truncate(ctx.unit.body || "（空白）", MAX_BODY_CHARS)}`);
  }
  if (ctx.scope?.kind && ctx.scope.kind !== "all") {
    parts.push(`【修改范围】${UNIT_TYPE_LABELS[ctx.scope.kind] ?? ctx.scope.kind}${ctx.scope.unitId ? `（unit:${ctx.scope.unitId}）` : ""}`);
  }
  return parts.join("\n\n");
}

export async function invokeScreenplayModel(ctx: KkInvokeContext): Promise<KkInvokeResult> {
  const system = buildSystemPrompt(ctx);
  const contextBlock = buildContextBlock(ctx);
  const history = ctx.history.slice(-MAX_HISTORY_MESSAGES);

  if (ctx.purpose === "discuss") {
    const messages: AIMessage[] = [
      { role: "system", content: system },
      { role: "system", content: contextBlock },
      ...history,
      { role: "user", content: ctx.userMessage },
    ];
    const result = await callDeepSeek({ messages, temperature: 0.75, maxTokens: 4096, timeoutMs: 120000 });
    return { assistantText: result.output, patches: [] };
  }

  if (ctx.purpose === "similarity_review") {
    const messages: AIMessage[] = [
      { role: "system", content: `${system}\n你现在的任务是雷同审查：对照当前世界规则、角色关系、剧情主线和关键转折，列出可能的相似风险位置、风险原因、需要保留的类型母题，以及可执行的原创化建议。只做创作侧核验，不做法律裁定，不自动改写正文。输出用清晰的小节和列表。` },
      { role: "system", content: contextBlock },
      ...history,
      { role: "user", content: ctx.userMessage },
    ];
    const result = await callDeepSeek({ messages, temperature: 0.4, maxTokens: 6144, timeoutMs: 150000 });
    return { assistantText: result.output, patches: [] };
  }

  // propose_change — strict JSON contract for reviewable patches.
  const patchContract = [
    "输出要求：只输出一个 JSON 对象，不要包裹 markdown 代码块，格式：",
    '{"assistantText":"一句话说明这版方案","patches":[{"unitPath":"定位标识（如 unit:<id> 或 world/character/outline/episode/scene:标题）","before":"被替换的原文片段（精确摘自当前文档；新增内容用空字符串）","after":"修改后的文本"}]}',
    "规则：before 必须能在当前文档中找到（新增类修改除外）；每个 patch 是一个最小可独立审阅的修改块；不输出无关内容。",
  ].join("\n");
  const messages: AIMessage[] = [
    { role: "system", content: `${system}\n${patchContract}` },
    { role: "system", content: contextBlock },
    ...history,
    { role: "user", content: ctx.userMessage },
  ];
  const result = await callDeepSeek({ messages, temperature: 0.55, maxTokens: 8192, timeoutMs: 150000 });
  return parsePatchResponse(result.output);
}

function parsePatchResponse(raw: string): KkInvokeResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    const parsed = JSON.parse(candidate) as {
      assistantText?: unknown;
      patches?: Array<{ unitPath?: unknown; before?: unknown; after?: unknown }>;
    };
    const patches = Array.isArray(parsed.patches)
      ? parsed.patches
          .filter((p): p is { unitPath: string; before: string; after: string } =>
            typeof p?.after === "string" && p.after.trim().length > 0)
          .slice(0, 20)
          .map((p) => ({
            unitPath: typeof p.unitPath === "string" && p.unitPath ? p.unitPath : "scope:current",
            before: typeof p.before === "string" ? p.before : "",
            after: p.after,
          }))
      : [];
    const assistantText = typeof parsed.assistantText === "string" && parsed.assistantText.trim()
      ? parsed.assistantText.trim()
      : patches.length
        ? "KK：基于当前文档生成了一版修改方案，请逐块审阅后采用。"
        : "KK：这次没有产生可审阅的修改块。请补充更具体的修改意图（例如指明段落或场次）。";
    return { assistantText, patches };
  } catch {
    // Model replied with prose instead of JSON — degrade to a single reviewable
    // patch carrying the suggestion verbatim; it still never auto-applies.
    return {
      assistantText: "KK：模型未按结构化格式返回，已将建议整理为单个待审阅修改块。",
      patches: raw.trim()
        ? [{ unitPath: "scope:current", before: "", after: truncate(raw.trim(), 4000) }]
        : [],
    };
  }
}
