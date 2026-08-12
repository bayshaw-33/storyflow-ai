import { NextResponse } from "next/server";
import { ProposalError } from "./index";

export function proposalErrorResponse(error: unknown, fallback = "Change proposal operation failed.") {
  const code = error instanceof ProposalError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "validation_failed" ? 422 : code === "conflict" ? 409 : 503;
  const message = code === "validation_failed" || code === "not_found" || code === "forbidden" || code === "conflict"
    ? (error instanceof Error ? error.message.replace(`${code}: `, "") : fallback)
    : fallback;
  return NextResponse.json({ success: false, error: message, code }, { status });
}
