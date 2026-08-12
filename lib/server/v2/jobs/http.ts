import { NextResponse } from "next/server";
import { V2JobsError } from "./index";

export function jobsErrorResponse(error: unknown, fallback = "Job read failed.") {
  const code = error instanceof V2JobsError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "validation_failed" ? 422 : 503;
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message.replace(`${code}: `, "") : fallback, code }, { status });
}
