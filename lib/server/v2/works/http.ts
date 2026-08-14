/**
 * KIIKIS V2.2 works route HTTP helpers.
 */

import { NextResponse } from "next/server";
import { WorksServiceError } from "./index";

export function worksErrorResponse(
  error: unknown,
  fallback = "Project start failed.",
) {
  const code =
    error instanceof WorksServiceError ? error.code : "service_unavailable";
  const status =
    code === "unauthenticated"
      ? 401
      : code === "forbidden"
        ? 403
        : code === "not_found"
          ? 404
          : code === "conflict"
            ? 409
            : code === "validation_failed"
              ? 422
              : code === "invalid_contract_version"
                ? 400
                : 503;
  const correlationId =
    error instanceof WorksServiceError ? error.correlationId : undefined;
  const message =
    error instanceof Error
      ? error.message.replace(`${code}: `, "")
      : fallback;
  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      ...(correlationId ? { correlationId } : {}),
    },
    { status },
  );
}
