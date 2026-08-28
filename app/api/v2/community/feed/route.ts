import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listCommunityFeed } from "@/lib/server/v2/community/discovery";
import { searchCommunityFeed } from "@/lib/server/v2/community/search";
import { CommunityServiceError, isSchemaError } from "@/lib/server/v2/community/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMUNITY_FEED_SECTIONS = [
  "recommended",
  "universes",
  "works",
  "actors",
  "assets",
] as const;

type FeedSection = (typeof COMMUNITY_FEED_SECTIONS)[number];

/**
 * C0 社区 Feed：返回带公开 source context 的卡片投影。
 * 旧 /discover 保持兼容；本路由只服务升级后的社区首页。
 */
export async function GET(request: NextRequest) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        {
          success: false,
          error: "社区服务尚未配置，请联系管理员。",
          code: "service_unavailable",
          correlationId: createCorrelationId(),
        },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const section = parseSection(url.searchParams.get("section"));
    const limit = parseNumber(url.searchParams.get("limit"), 20, 100);
    const offset = parseNumber(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER);
    const cursor = url.searchParams.get("cursor");
    const query = url.searchParams.get("q") || "";
    const viewer = await getViewerFromRequest(request);
    const useCursor = Boolean(cursor || query || !url.searchParams.has("offset"));
    const searchResult = useCursor
      ? await searchCommunityFeed(serviceFetch, {
          section,
          query,
          cursor,
          viewerId: viewer?.id ?? null,
          limit: Math.min(limit, 50),
        })
      : null;
    const items = searchResult?.items ?? await listCommunityFeed(serviceFetch, {
      section,
      viewerId: viewer?.id ?? null,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.feed/1",
      items,
      nextOffset: offset + items.length,
      nextCursor: searchResult?.nextCursor ?? null,
      hasMore: searchResult?.hasMore ?? items.length === limit,
      degraded: searchResult?.degraded ?? false,
      query,
      section,
      viewerId: viewer?.id ?? null,
      correlationId: createCorrelationId(),
    });
  } catch (error) {
    return feedErrorResponse(error);
  }
}

function parseSection(value: string | null): FeedSection {
  if (!value || value === "recommended") return "recommended";
  if ((COMMUNITY_FEED_SECTIONS as readonly string[]).includes(value)) {
    return value as FeedSection;
  }
  throw new CommunityServiceError(
    "validation_failed",
    `section must be one of ${COMMUNITY_FEED_SECTIONS.join(", ")}`,
    400,
  );
}

function parseNumber(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    throw new CommunityServiceError("validation_failed", "limit and offset must be valid integers", 400);
  }
  return parsed;
}

function feedErrorResponse(error: unknown) {
  const correlationId = error instanceof CommunityServiceError ? error.correlationId : createCorrelationId();
  const schema =
    error instanceof CommunityServiceError
      ? isSchemaError(error.cause) || isSchemaError(error.message)
      : isSchemaError(error);

  if (error instanceof CommunityServiceError) {
    return NextResponse.json(
      {
        success: false,
        error: schema
          ? `数据库 schema 缺失列或表，请联系管理员核对迁移：${error.message.slice(0, 200)}`
          : error.message,
        code: schema ? "schema_error" : error.code,
        correlationId,
      },
      { status: schema ? 500 : error.status },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: schema
        ? `数据库 schema 缺失列或表，请联系管理员核对迁移。`
        : "社区 Feed 暂时无法加载，请稍后重试。",
      code: schema ? "schema_error" : "service_unavailable",
      correlationId,
    },
    { status: schema ? 500 : 503 },
  );
}

function createCorrelationId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID().slice(0, 8);
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(16).slice(-4)}${Math.random().toString(16).slice(2, 6)}`;
}
