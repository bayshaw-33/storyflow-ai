import { NextRequest, NextResponse } from "next/server";
import { generateAIContent } from "@/lib/ai/generate";
import { classifyServiceError } from "@/lib/server/v2/service-errors";
import { ScreenplayGenerationService } from "@/lib/server/v2/screenplays/generation";
import { ScreenplayTrilogyError, ScreenplayTrilogyService, type TrilogyProjectContext } from "@/lib/server/v2/screenplays/trilogy";
import { ScreenplayUnitsService } from "@/lib/server/v2/screenplays/units";
import { getUnifiedWorkbenchContext } from "@/lib/server/v2/unified-workbench";
import { normalizeScreenplayConversationId } from "@/lib/server/v2/screenplays/conversation-id";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Screenplay service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const conversationId = normalizeScreenplayConversationId(workId, String(body.conversationId ?? ""));
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "conversationId must be a UUID.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const units = new ScreenplayUnitsService(serviceFetch);
    const conversations = new ScreenplayGenerationService(serviceFetch, {
      contextPacket: async () => ({ packetId: null, references: [] }),
      modelInvoke: async () => { throw new Error("Model invocation is not used by trilogy persistence."); },
    });
    const trilogy = new ScreenplayTrilogyService({
      listUnits: (input) => units.listUnits(input),
      getUnit: (input) => units.getUnit(input),
      createUnit: (input) => units.createUnit(input),
      saveUnitContent: (input) => units.saveUnitContent(input),
      findUnitVersionByIdempotencyKey: (input) => units.findUnitVersionByIdempotencyKey(input),
      listMessages: (input) => conversations.listMessages(input),
      appendAssistantMessage: (input) => conversations.appendAssistantMessage(input),
      generateContent: (input) => generateAIContent(input),
    });
    const projectContext = await loadProjectContext({
      projectId: String(body.projectId ?? ""),
      workId,
      ownerId: viewer.id,
    });
    const result = await trilogy.generateNext({
      ownerId: viewer.id,
      workId,
      conversationId,
      idempotencyKey: String(body.idempotencyKey ?? ""),
      projectContext,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      ...result,
    });
  } catch (error) {
    const classified = classifyServiceError(error, "screenplay-trilogy");
    return NextResponse.json(
      { success: false, error: classified.message, code: classified.code, requestId: classified.requestId },
      { status: classified.status },
    );
  }
}

async function loadProjectContext(input: {
  projectId: string;
  workId: string;
  ownerId: string;
}): Promise<TrilogyProjectContext | undefined> {
  if (!input.projectId) return undefined;
  const context = await getUnifiedWorkbenchContext({
    projectId: input.projectId,
    ownerId: input.ownerId,
    fetcher: serviceFetch,
  });
  if (context.stages.script?.workId !== input.workId) {
    throw new ScreenplayTrilogyError("validation_failed", "Project and screenplay work do not match.");
  }
  const rows = await serviceFetch<Array<{ data?: Record<string, unknown> | null }>>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(input.projectId)}&select=data&limit=1`,
  );
  const data = rows?.[0]?.data ?? {};
  const workspace = recordValue(data.creationWorkspace);
  const settings = recordValue(workspace.settings);
  return {
    projectTitle: context.project.title,
    universeName: context.universe?.name,
    market: stringValue(settings.targetMarket) || stringValue(data.market),
    genre: stringValue(settings.genre) || stringValue(data.genre),
    idea: stringValue(data.idea),
    interfaceLanguage: stringValue(settings.interfaceLanguage),
    sourceLanguage: stringValue(settings.sourceLanguage),
    screenplayLanguage: stringValue(settings.screenplayLanguage),
    dialogueLanguage: stringValue(settings.dialogueLanguage),
    screenplayFormat: screenplayFormatValue(settings.screenplayFormat),
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function screenplayFormatValue(value: unknown): TrilogyProjectContext["screenplayFormat"] {
  return value === "international_production" || value === "hollywood_spec" || value === "asian_production"
    ? value
    : undefined;
}
