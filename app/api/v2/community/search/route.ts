import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { searchCommunityFeed } from "@/lib/server/v2/community/search";
import type { CommunityFeedSection } from "@/lib/server/v2/community/discovery";
import { CommunityServiceError, isSchemaError } from "@/lib/server/v2/community/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_SECTIONS = ["recommended", "universes", "works", "actors", "assets"] as const;
type SearchSection = (typeof SEARCH_SECTIONS)[number];

export async function GET(request: NextRequest) {
  try {
    const correlationId = createCorrelationId();
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        {
          success: false,
          error: "社区服务尚未配置，请联系管理员。",
          code: "service_unavailable",
          degraded: true,
          correlationId,
        },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const section = parseSection(url.searchParams.get("section"));
    const limit = parseLimit(url.searchParams.get("limit"));
    const query = url.searchParams.get("q") || "";
    const cursor = url.searchParams.get("cursor");
    const viewer = await getViewerFromRequest(request);
    const result = await searchCommunityFeed(serviceFetch, {
      query,
      section,
      cursor,
      limit,
      viewerId: viewer?.id ?? null,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.search/1",
      items: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      degraded: result.degraded,
      query,
      section,
      viewerId: viewer?.id ?? null,
      correlationId,
    });
  } catch (error) {
    return searchErrorResponse(error);
  }
}

function parseSection(value: string | null): SearchSection {
  if (!value || value === "recommended") return "recommended";
  if ((SEARCH_SECTIONS as readonly string[]).includes(value)) return value as SearchSection;
  throw new CommunityServiceError("validation_failed", `section must be one of ${SEARCH_SECTIONS.join(", ")}`, 400);
}

function parseLimit(value: string | null): number {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new CommunityServiceError("validation_failed", "limit must be an integer between 1 and 50", 400);
  }
  return parsed;
}

function searchErrorResponse(error: unknown) {
  const correlationId = error instanceof CommunityServiceError ? error.correlationId : createCorrelationId();
  const schema = error instanceof CommunityServiceError
    ? isSchemaError(error.cause) || isSchemaError(error.message)
    : isSchemaError(error);
  const code = schema ? "schema_error" : error instanceof CommunityServiceError ? error.code : "service_unavailable";
  const status = schema ? 500 : error instanceof CommunityServiceError ? error.status : 503;
  return NextResponse.json(
    {
      success: false,
      error: schema ? "数据库 schema 缺失列或表，请联系管理员核对迁移。" : "社区搜索暂时无法加载，请稍后重试。",
      code,
      degraded: true,
      correlationId,
    },
    { status },
  );
}

function createCorrelationId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID().slice(0, 8);
  } catch {
    // fall through
  }
  return `${Date.now().toString(16).slice(-4)}${Math.random().toString(16).slice(2, 6)}`;
}
