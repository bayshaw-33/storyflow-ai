import { NextResponse } from "next/server";
import { CreativeEventsError } from "./index";

/** 把 CreativeEventsError 映射为 NextResponse，未识别错误归一化为 503。 */
export function creativeEventsErrorResponse(
  error: unknown,
  fallback = "Creative event operation failed."
) {
  const code =
    error instanceof CreativeEventsError ? error.code : "service_unavailable";
  const status =
    code === "unauthenticated"
      ? 401
      : code === "forbidden"
        ? 403
        : code === "validation_failed"
          ? 422
          : 503;
  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message.replace(`${code}: `, "")
          : fallback,
      code,
    },
    { status }
  );
}
