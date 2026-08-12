import { NextResponse } from "next/server";
import { CanonError } from "./index";

export function canonErrorResponse(error: unknown, fallback = "Canon operation failed.") {
  const code = error instanceof CanonError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "validation_failed" ? 422 : code === "ai_unavailable" ? 503 : 503;
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message.replace(`${code}: `, "") : fallback, code }, { status });
}
