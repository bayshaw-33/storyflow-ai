import { NextResponse } from "next/server";
import { V2JobsError, type V2JobsErrorCode } from "./index";

const HTTP_BY_CODE: Record<V2JobsErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  schema_not_deployed: 503,
  rate_limited: 429,
  provider_failed: 502,
  service_unavailable: 503,
};

/**
 * P0-05: error responses carry a safe `code` + optional requestId. V2JobsError
 * messages are sanitized at construction (toServiceJobsError → classifyServiceError),
 * so raw PostgREST payloads never reach the client. Unknown errors fall back to
 * the generic message without echoing the raw error text.
 */
export function jobsErrorResponse(error: unknown, fallback = "Job read failed.") {
  if (error instanceof V2JobsError) {
    return NextResponse.json(
      { success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code, requestId: error.requestId ?? null },
      { status: HTTP_BY_CODE[error.code] },
    );
  }
  return NextResponse.json({ success: false, error: fallback, code: "service_unavailable" }, { status: 503 });
}
