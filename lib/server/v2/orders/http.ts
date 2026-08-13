import { NextResponse } from "next/server";
import { OrdersError } from "./index";

export function ordersErrorResponse(error: unknown, fallback = "Order operation failed.") {
  const code = error instanceof OrdersError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "validation_failed" ? 422 : code === "conflict" ? 409 : 503;
  const message = ["validation_failed", "not_found", "forbidden", "conflict"].includes(code) ? (error instanceof Error ? error.message.replace(`${code}: `, "") : fallback) : fallback;
  return NextResponse.json({ success: false, error: message, code }, { status });
}
