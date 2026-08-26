import { NextResponse } from "next/server";
import { AssetError } from "./index";

export function assetErrorResponse(error: unknown, fallback = "Asset operation failed.") {
  const requestId = crypto.randomUUID();
  const code = error instanceof AssetError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "validation_failed" ? 422 : code === "conflict" ? 409 : 503;
  const message = ["validation_failed", "not_found", "forbidden", "conflict"].includes(code) ? (error instanceof Error ? error.message.replace(`${code}: `, "") : fallback) : fallback;
  const retryable = status >= 500;
  return NextResponse.json({ success: false, error: message, code, requestId, retryable, retryAfter: retryable ? 5 : null }, { status });
}
