/**
 * KIIKIS 2.1 Phase 3 — KK API HTTP 错误响应封装 (Task 3.2)
 *
 * 与 dynamic-storyboards/http.ts 模式一致，集中处理 service 错误 → HTTP 响应。
 */
import { NextResponse } from "next/server";
import { KkProfileServiceError } from "./profile.ts";

export function kkProfileErrorResponse(error: unknown, defaultMessage: string) {
  if (error instanceof KkProfileServiceError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : defaultMessage;
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: "service_unavailable",
    },
    { status: 503 },
  );
}
