import { NextResponse } from "next/server";
import { CanonError } from "./index";

export function canonErrorResponse(error: unknown, fallback = "Canon operation failed.") {
  const code = error instanceof CanonError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "validation_failed" ? 422 : code === "ai_unavailable" ? 503 : 503;
  const message = code === "validation_failed" || code === "not_found" || code === "forbidden" || code === "ai_unavailable"
    ? (error instanceof Error ? error.message.replace(`${code}: `, "") : fallback)
    : fallback;
  return NextResponse.json({ success: false, error: message, code }, { status });
}
