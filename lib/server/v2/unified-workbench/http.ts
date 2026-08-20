import { NextResponse } from "next/server";
import { UnifiedWorkbenchServiceError } from "./index";

const STATUS_BY_CODE = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  schema_missing: 503,
  service_unavailable: 503,
} as const;

type UnifiedWorkbenchHttpCode = keyof typeof STATUS_BY_CODE;

export function unifiedWorkbenchErrorResponse(
  error: unknown,
  fallback = "Unified workbench service is unavailable.",
) {
  const normalized = normalizeError(error, fallback);
  return NextResponse.json(
    {
      success: false,
      error: normalized.message,
      code: normalized.code,
      correlationId: normalized.correlationId,
    },
    { status: STATUS_BY_CODE[normalized.code] },
  );
}

function normalizeError(error: unknown, fallback: string): {
  code: UnifiedWorkbenchHttpCode;
  message: string;
  correlationId: string;
} {
  if (error instanceof UnifiedWorkbenchServiceError) {
    return {
      code: error.code,
      message: error.message.replace(`${error.code}: `, ""),
      correlationId: error.correlationId ?? crypto.randomUUID(),
    };
  }
  const message = error instanceof Error ? error.message : fallback;
  if (/MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN|MISSING_SUPABASE_SERVER_CONFIG/.test(message)) {
    return { code: "unauthenticated", message: "Authentication is required.", correlationId: crypto.randomUUID() };
  }
  if (/PGRST202|PGRST205|42P01/.test(message)) {
    return { code: "schema_missing", message: "Database schema is not deployed for this feature yet.", correlationId: crypto.randomUUID() };
  }
  return { code: "service_unavailable", message: fallback, correlationId: crypto.randomUUID() };
}
