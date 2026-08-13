import { NextResponse } from "next/server";
import { DynamicGridStoreError } from "./index";

/** 把 DynamicGridStoreError 映射为 NextResponse。 */
export function dynamicStoryboardErrorResponse(
  error: unknown,
  fallback = "Dynamic storyboard operation failed."
) {
  const code =
    error instanceof DynamicGridStoreError ? error.code : "service_unavailable";
  const status =
    code === "unauthenticated"
      ? 401
      : code === "forbidden"
        ? 403
        : code === "not_found"
          ? 404
          : code === "validation_failed"
            ? 422
            : code === "conflict" || code === "locked_override"
              ? 409
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
