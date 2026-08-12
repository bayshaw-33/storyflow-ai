import { NextResponse } from "next/server";
import { V2UniverseError, type UniverseReadFetcher } from "./index";

export function createUniverseReadFetcher(fetcher: UniverseReadFetcher): UniverseReadFetcher {
  return fetcher;
}

export function universeErrorResponse(error: unknown, fallback = "Universe read failed.") {
  const code = error instanceof V2UniverseError ? error.code : "service_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "validation_failed" ? 422 : 503;
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message.replace(`${code}: `, "") : fallback, code }, { status });
}
