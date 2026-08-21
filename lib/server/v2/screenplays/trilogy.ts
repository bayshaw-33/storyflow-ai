import {
  TRILOGY_STAGES,
  findTrilogyUnit,
  resolveTrilogyState,
  type TrilogyStage,
  type TrilogyState,
  type TrilogyUnitLike,
} from "../../../contracts/v2/screenplay-trilogy.ts";

export { resolveTrilogyState } from "../../../contracts/v2/screenplay-trilogy.ts";
export type { TrilogyStage, TrilogyState, TrilogyUnitLike } from "../../../contracts/v2/screenplay-trilogy.ts";

export class ScreenplayTrilogyError extends Error {
  readonly code: "conflict" | "validation_failed" | "service_unavailable";

  constructor(code: ScreenplayTrilogyError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ScreenplayTrilogyError";
    this.code = code;
  }
}

interface TrilogyMessage {
  id: string;
  role: string;
  content: string;
}

interface TrilogyGenerationDeps {
  listUnits: (params: { ownerId: string; workId: string }) => Promise<{ units: TrilogyUnitLike[] }>;
  getUnit: (params: { ownerId: string; workId: string; unitId: string }) => Promise<{ unit: TrilogyUnitLike; content: unknown }>;
  createUnit: (params: {
    ownerId: string;
    workId: string;
    type: TrilogyStage;
    title: string;
    parentId: null;
    order: number;
    legacyId: string;
  }) => Promise<{ unit: TrilogyUnitLike }>;
  saveUnitContent: (params: {
    ownerId: string;
    workId: string;
    unitId: string;
    content: Record<string, unknown>;
    baseVersionId: string | null;
    source: string;
    sourceMessageIds: string[];
    references: Array<{ unitId: string | null; unitVersionId: string | null }>;
    idempotencyKey: string;
  }) => Promise<{ version: { id: string }; references: Array<{ unitId: string | null; unitVersionId: string | null }> }>;
  findUnitVersionByIdempotencyKey: (params: {
    ownerId: string;
    workId: string;
    unitId: string;
    idempotencyKey: string;
  }) => Promise<{ id: string } | null>;
  listMessages: (params: { ownerId: string; workId: string; conversationId: string; limit?: number }) => Promise<{ messages: TrilogyMessage[] }>;
  appendAssistantMessage: (params: {
    ownerId: string;
    workId: string;
    conversationId: string;
    content: string;
    idempotencyKey: string;
  }) => Promise<TrilogyMessage>;
  generateContent: (payload: {
    taskType: "creation_background_world" | "creation_character_bible" | "creation_plot_outline";
    input: string;
    context: string;
    allSteps: Partial<Record<"creation_background_world" | "creation_character_bible" | "creation_plot_outline", string>>;
    projectTitle?: string;
    market?: string;
    genre?: string;
    idea?: string;
    options: {
      contentMode: "screenplay";
      interfaceLanguage?: string;
      sourceLanguage?: string;
      screenplayLanguage?: string;
      dialogueLanguage?: string;
      screenplayFormat?: "international_production" | "hollywood_spec" | "asian_production";
    };
  }) => Promise<{ output: string }>;
}

export interface TrilogyProjectContext {
  projectTitle?: string;
  universeName?: string;
  market?: string;
  genre?: string;
  idea?: string;
  interfaceLanguage?: string;
  sourceLanguage?: string;
  screenplayLanguage?: string;
  dialogueLanguage?: string;
  screenplayFormat?: "international_production" | "hollywood_spec" | "asian_production";
}

const STAGE_CONFIG = {
  world: {
    title: "背景及世界观",
    taskType: "creation_background_world",
    notice: "背景及世界观草稿已生成。请审阅并确认可用，之后我会继续生成角色圣经。",
  },
  character: {
    title: "角色圣经",
    taskType: "creation_character_bible",
    notice: "角色圣经草稿已生成。请审阅并确认可用，之后我会继续生成剧情及大纲。",
  },
  outline: {
    title: "剧情及大纲",
    taskType: "creation_plot_outline",
    notice: "剧情及大纲草稿已生成。请审阅并确认可用，项目背景三件套即可完成。",
  },
} as const;

export class ScreenplayTrilogyService {
  private readonly deps: TrilogyGenerationDeps;

  constructor(deps: TrilogyGenerationDeps) {
    this.deps = deps;
  }

  async generateNext(params: {
    ownerId: string;
    workId: string;
    conversationId: string;
    idempotencyKey: string;
    projectContext?: TrilogyProjectContext;
  }) {
    if (!params.idempotencyKey) {
      throw new ScreenplayTrilogyError("validation_failed", "idempotencyKey is required.");
    }
    const { units } = await this.deps.listUnits({ ownerId: params.ownerId, workId: params.workId });
    const replay = await this.findReplay(params, units);
    if (replay) return replay;
    const state = resolveTrilogyState(units);
    if (state.status === "waiting_confirmation") {
      throw new ScreenplayTrilogyError("conflict", "请先确认当前三部曲文档为可用版本。");
    }
    if (state.status === "complete") {
      throw new ScreenplayTrilogyError("conflict", "项目背景三件套已经完成。");
    }

    const config = STAGE_CONFIG[state.stage];
    const { messages } = await this.deps.listMessages({
      ownerId: params.ownerId,
      workId: params.workId,
      conversationId: params.conversationId,
      limit: 200,
    });
    const conversation = selectConversationMessages(messages);
    const upstream = await this.loadUpstream(params.ownerId, params.workId, units, state.stage);
    const projectContext = formatProjectContext(params.projectContext);
    const generated = await this.deps.generateContent({
      taskType: config.taskType,
      input: formatConversation(conversation),
      context: [projectContext, ...upstream.map((item) => `【${item.title}】\n${item.body}`)].filter(Boolean).join("\n\n"),
      allSteps: Object.fromEntries(upstream.map((item) => [STAGE_CONFIG[item.stage].taskType, item.body])),
      projectTitle: params.projectContext?.projectTitle,
      market: params.projectContext?.market,
      genre: params.projectContext?.genre,
      idea: params.projectContext?.idea,
      options: {
        contentMode: "screenplay",
        interfaceLanguage: params.projectContext?.interfaceLanguage,
        sourceLanguage: params.projectContext?.sourceLanguage,
        screenplayLanguage: params.projectContext?.screenplayLanguage,
        dialogueLanguage: params.projectContext?.dialogueLanguage,
        screenplayFormat: params.projectContext?.screenplayFormat,
      },
    });
    if (!generated.output.trim()) {
      throw new ScreenplayTrilogyError("service_unavailable", "AI returned empty trilogy content.");
    }

    const existing = state.unitId ? units.find((unit) => unit.id === state.unitId) : null;
    let unit = existing;
    if (!unit) {
      try {
        ({ unit } = await this.deps.createUnit({
          ownerId: params.ownerId,
          workId: params.workId,
          type: state.stage,
          title: config.title,
          parentId: null,
          order: TRILOGY_STAGES.findIndex((item) => item.stage === state.stage) + 1,
          legacyId: TRILOGY_STAGES.find((item) => item.stage === state.stage)!.legacyId,
        }));
      } catch (error) {
        const refreshed = await this.deps.listUnits({ ownerId: params.ownerId, workId: params.workId });
        if (findTrilogyUnit(refreshed.units, state.stage)) {
          throw new ScreenplayTrilogyError("conflict", "该文档正在另一个请求中生成，请稍后刷新查看。");
        }
        throw error;
      }
    }
    const references = upstream.map((item) => ({ unitId: item.unit.id, unitVersionId: item.unit.finalizedVersionId }));
    const { version } = await this.deps.saveUnitContent({
      ownerId: params.ownerId,
      workId: params.workId,
      unitId: unit.id,
      content: { body: generated.output.trim() },
      baseVersionId: unit.currentVersionId,
      source: "ai",
      sourceMessageIds: conversation.map((message) => message.id),
      references,
      idempotencyKey: `${params.idempotencyKey}:version`,
    });
    await this.deps.appendAssistantMessage({
      ownerId: params.ownerId,
      workId: params.workId,
      conversationId: params.conversationId,
      content: config.notice,
      idempotencyKey: `${params.idempotencyKey}:assistant`,
    }).catch(() => undefined);

    const nextUnits = units.map((candidate) => candidate.id === unit.id
      ? { ...candidate, currentVersionId: version.id, readiness: "draft" }
      : candidate);
    if (!nextUnits.some((candidate) => candidate.id === unit.id)) {
      nextUnits.push({ ...unit, currentVersionId: version.id, readiness: "draft" });
    }
    return { stage: state.stage, unit: { ...unit, currentVersionId: version.id, readiness: "draft" }, version, nextState: resolveTrilogyState(nextUnits) };
  }

  private async findReplay(
    params: { ownerId: string; workId: string; idempotencyKey: string },
    units: TrilogyUnitLike[],
  ) {
    for (const item of TRILOGY_STAGES) {
      const unit = findTrilogyUnit(units, item.stage);
      if (!unit) continue;
      const version = await this.deps.findUnitVersionByIdempotencyKey({
        ownerId: params.ownerId,
        workId: params.workId,
        unitId: unit.id,
        idempotencyKey: `${params.idempotencyKey}:version`,
      });
      if (version) {
        return { stage: item.stage, unit, version, nextState: resolveTrilogyState(units) };
      }
    }
    return null;
  }

  private async loadUpstream(ownerId: string, workId: string, units: TrilogyUnitLike[], stage: TrilogyStage) {
    const index = TRILOGY_STAGES.findIndex((item) => item.stage === stage);
    const required = TRILOGY_STAGES.slice(0, index);
    const result: Array<{ stage: TrilogyStage; title: string; body: string; unit: TrilogyUnitLike }> = [];
    for (const item of required) {
      const unit = findTrilogyUnit(units, item.stage);
      if (!unit?.finalizedVersionId) {
        throw new ScreenplayTrilogyError("conflict", "上一步尚未确认可用。");
      }
      const loaded = await this.deps.getUnit({ ownerId, workId, unitId: unit.id });
      const body = String((loaded.content as { body?: unknown } | null)?.body ?? "").trim();
      result.push({ stage: item.stage, title: STAGE_CONFIG[item.stage].title, body, unit });
    }
    return result;
  }
}

function formatConversation(messages: TrilogyMessage[]): string {
  return messages
    .map((message) => `${message.role === "user" ? "用户" : "KK"}：${message.content}`)
    .join("\n\n");
}

const MAX_TRILOGY_CONVERSATION_CHARS = 24_000;

function selectConversationMessages(messages: TrilogyMessage[]): TrilogyMessage[] {
  const selected: TrilogyMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const renderedLength = `${message.role === "user" ? "用户" : "KK"}：${message.content}`.length + (selected.length ? 2 : 0);
    if (used + renderedLength > MAX_TRILOGY_CONVERSATION_CHARS) {
      if (!selected.length) {
        selected.unshift({ ...message, content: message.content.slice(0, MAX_TRILOGY_CONVERSATION_CHARS - 4) });
      }
      break;
    }
    selected.unshift(message);
    used += renderedLength;
  }
  return selected;
}

function formatProjectContext(context?: TrilogyProjectContext): string {
  if (!context) return "";
  return [
    context.projectTitle ? `项目名称：${context.projectTitle}` : "",
    context.universeName ? `关联 Universe：${context.universeName}` : "",
    context.market ? `目标市场：${context.market}` : "",
    context.genre ? `题材：${context.genre}` : "",
    context.idea ? `项目创意：${context.idea}` : "",
    context.screenplayLanguage ? `剧本语言：${context.screenplayLanguage}` : "",
    context.dialogueLanguage ? `对白语言：${context.dialogueLanguage}` : "",
    context.screenplayFormat ? `剧本格式：${context.screenplayFormat}` : "",
  ].filter(Boolean).join("\n");
}
