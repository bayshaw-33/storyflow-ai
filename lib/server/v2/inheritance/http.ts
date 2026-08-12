import { NextResponse } from "next/server";
import { InheritanceError } from "./index";

export function inheritanceErrorResponse(error: unknown, fallback = "Inheritance operation failed.") {
  const code = error instanceof InheritanceError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "conflict" ? 409 : code === "validation_failed" ? 422 : 503;
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message.replace(`${code}: `, "") : fallback, code }, { status });
}
