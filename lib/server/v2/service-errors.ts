/**
 * Shared service-error classification for V2.2 route handlers.
 *
 * Production incident (2026-08-16): screenplay endpoints swallowed every
 * Supabase failure into an English "service unavailable" 503, which hid the
 * real cause (missing migrations → PGRST205) from users and operators.
 *
 * Contract:
 *   - Response body keeps a SAFE machine code + requestId; never leaks the
 *     PostgREST payload to the client.
 *   - Server logs keep the original PostgREST code / HTTP status for ops.
 *   - The client maps codes to Chinese guidance (schema not deployed /
 *     retry / re-login).
 */

export type SafeServiceErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "provider_failed"
  | "schema_not_deployed"
  | "rate_limited"
  | "service_unavailable";

const HTTP_BY_CODE: Record<SafeServiceErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  provider_failed: 502,
  schema_not_deployed: 503,
  rate_limited: 429,
  service_unavailable: 503,
};

export interface ClassifiedServiceError {
  code: SafeServiceErrorCode;
  status: number;
  /** Safe, generic English error for the response body (client localizes). */
  message: string;
  /** Correlation id — safe to expose; lets support find the log line. */
  requestId: string;
  /** Original PostgREST error code (e.g. PGRST205) — log only. */
  pgrstCode?: string;
  /** Original HTTP status from Supabase — log only. */
  upstreamStatus?: number;
}

const SCHEMA_MISSING_PGRST_CODES = new Set(["PGRST205", "PGRST204", "PGRST206"]);

function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Classify an unknown error thrown below the route handler (service layer,
 * serviceFetch, provider calls). Known service errors with their own `code`
 * field pass their code through when it maps onto the safe set.
 */
export function classifyServiceError(error: unknown, route: string): ClassifiedServiceError {
  const requestId = newRequestId();
  const message = error instanceof Error ? error.message : String(error);

  // serviceFetch failure shape: SUPABASE_SERVICE_ERROR:<status>:<body>
  const supabaseMatch = message.match(/^SUPABASE_SERVICE_ERROR:(\d{3}):([\s\S]*)$/);
  if (supabaseMatch) {
    const upstreamStatus = Number(supabaseMatch[1]);
    let pgrstCode: string | undefined;
    try {
      const parsed = JSON.parse(supabaseMatch[2]) as { code?: string; message?: string };
      if (parsed?.code) pgrstCode = String(parsed.code);
    } catch {
      pgrstCode = undefined;
    }
    if (pgrstCode && SCHEMA_MISSING_PGRST_CODES.has(pgrstCode)) {
      logServiceError(route, requestId, message, { pgrstCode, upstreamStatus });
      return {
        code: "schema_not_deployed",
        status: HTTP_BY_CODE.schema_not_deployed,
        message: "Database schema is not deployed for this feature yet.",
        requestId,
        pgrstCode,
        upstreamStatus,
      };
    }
    if (upstreamStatus === 401 || pgrstCode === "PGRST301") {
      logServiceError(route, requestId, message, { pgrstCode, upstreamStatus });
      return {
        code: "unauthenticated",
        status: HTTP_BY_CODE.unauthenticated,
        message: "Authentication required.",
        requestId,
        pgrstCode,
        upstreamStatus,
      };
    }
    if (upstreamStatus === 429) {
      logServiceError(route, requestId, message, { pgrstCode, upstreamStatus });
      return {
        code: "rate_limited",
        status: HTTP_BY_CODE.rate_limited,
        message: "Too many requests; please retry shortly.",
        requestId,
        pgrstCode,
        upstreamStatus,
      };
    }
    logServiceError(route, requestId, message, { pgrstCode, upstreamStatus });
    return {
      code: "service_unavailable",
      status: HTTP_BY_CODE.service_unavailable,
      message: "Upstream data service failed.",
      requestId,
      pgrstCode,
      upstreamStatus,
    };
  }

  // Provider/network failures.
  if (/^DEEPSEEK_|^MINIMAX_|PROVIDER|fetch failed|network/i.test(message)) {
    logServiceError(route, requestId, message, {});
    return {
      code: "provider_failed",
      status: HTTP_BY_CODE.provider_failed,
      message: "AI provider is temporarily unavailable.",
      requestId,
    };
  }

  // Service-layer errors that already carry a safe code (ScreenplayUnitsError etc.)
  const coded = error as { code?: unknown };
  if (coded && typeof coded.code === "string" && coded.code in HTTP_BY_CODE) {
    const code = coded.code as SafeServiceErrorCode;
    const detail = message.includes(": ") ? message.slice(message.indexOf(": ") + 2) : message;
    return {
      code,
      status: HTTP_BY_CODE[code],
      message: detail.slice(0, 200),
      requestId,
    };
  }

  logServiceError(route, requestId, message, {});
  return {
    code: "service_unavailable",
    status: HTTP_BY_CODE.service_unavailable,
    message: "Service is temporarily unavailable.",
    requestId,
  };
}

function logServiceError(
  route: string,
  requestId: string,
  rawMessage: string,
  extra: { pgrstCode?: string; upstreamStatus?: number },
): void {
  // Raw message keeps the original PostgREST code/payload for operators;
  // it never reaches the client. Truncate to bound log size.
  console.error(
    JSON.stringify({
      requestId,
      route,
      pgrstCode: extra.pgrstCode ?? null,
      upstreamStatus: extra.upstreamStatus ?? null,
      raw: rawMessage.slice(0, 400),
    }),
  );
}
