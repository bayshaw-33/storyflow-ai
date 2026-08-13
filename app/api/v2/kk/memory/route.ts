import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { kkProfileErrorResponse } from "@/lib/server/v2/kk";
import {
  KK_MEMORY_FACT_TYPES,
  KkProfileValidationError,
  type KkMemoryFactType,
} from "@/lib/contracts/v2/kk-profile.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/kk/memory — 列出 owner 的陪伴上下文记忆 (K21-KK-010)
 *   query: factType (可选过滤), limit
 *   返回未软删除的事实
 *
 * POST /api/v2/kk/memory — 添加新记忆事实 (K21-KK-010)
 *   body: { factType, factKey, factValue, source?, isSensitive? }
 *
 * DELETE /api/v2/kk/memory?id=xxx — 删除记忆 (K21-KK-014)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "KK service not configured (K21-KK-002).", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const factType = url.searchParams.get("factType");
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(Math.max(limitRaw ? parseInt(limitRaw, 10) : 100, 1), 500);

    let path = `/rest/v1/storyflow_kk_memory_facts?owner_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null&order=created_at.desc&limit=${limit}`;
    if (factType) {
      if (!KK_MEMORY_FACT_TYPES.includes(factType)) {
        return NextResponse.json(
          { success: false, error: `Invalid factType: ${factType}`, code: "validation_failed" },
          { status: 422 },
        );
      }
      path += `&fact_type=eq.${encodeURIComponent(factType)}`;
    }

    const rows = await serviceFetch<Array<{
      id: string;
      owner_id: string;
      fact_type: string;
      fact_key: string;
      fact_value: Record<string, unknown> | null;
      source: string;
      is_sensitive: boolean | null;
      created_at: string;
      deleted_at: string | null;
    }>>(path);

    const facts = (rows ?? []).map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      factType: r.fact_type,
      factKey: r.fact_key,
      factValue: r.fact_value ?? {},
      source: r.source,
      isSensitive: r.is_sensitive ?? false,
      createdAt: r.created_at,
      deletedAt: r.deleted_at,
    }));

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.kk-runtime/1",
      facts,
    });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to fetch KK memory.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "KK service not configured (K21-KK-002).", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));

    if (!body.factType || !body.factKey) {
      return NextResponse.json(
        { success: false, error: "factType and factKey are required.", code: "validation_failed" },
        { status: 422 },
      );
    }
    if (!KK_MEMORY_FACT_TYPES.includes(body.factType)) {
      return NextResponse.json(
        { success: false, error: `Invalid factType: ${body.factType}`, code: "validation_failed" },
        { status: 422 },
      );
    }
    if (body.factValue == null || typeof body.factValue !== "object" || Array.isArray(body.factValue)) {
      return NextResponse.json(
        { success: false, error: "factValue must be a JSON object.", code: "validation_failed" },
        { status: 422 },
      );
    }

    // K21-KK-011: 敏感事实的读取需服务端权限校验
    // 这里只标记 is_sensitive=true，读取时由其他路径控制
    const source = typeof body.source === "string" && body.source === "system" ? "system" : "user";
    const isSensitive = body.isSensitive === true;

    const row = await serviceFetch<{ id: string }>(
      `/rest/v1/storyflow_kk_memory_facts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json",
        },
        body: JSON.stringify({
          owner_id: user.id,
          fact_type: body.factType,
          fact_key: body.factKey,
          fact_value: body.factValue,
          source,
          is_sensitive: isSensitive,
        }),
      },
    );

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.kk-runtime/1",
      fact: {
        id: row.id,
        ownerId: user.id,
        factType: body.factType,
        factKey: body.factKey,
        factValue: body.factValue,
        source,
        isSensitive,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
    }, { status: 201 });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to add KK memory fact.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "KK service not configured (K21-KK-002).", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "id query parameter is required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    // 软删除 (K21-KK-014 提供明确删除入口)
    await serviceFetch(
      `/rest/v1/storyflow_kk_memory_facts?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      },
    );

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to delete KK memory.");
  }
}
