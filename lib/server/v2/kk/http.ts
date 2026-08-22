/**
 * KIIKIS 2.1 Phase 3 — KK API HTTP 错误响应封装 (Task 3.2)
 *
 * P0-01：认证失败必须回 401（客户端引导重登），不得伪装 503"服务不可用"；
 * 其余错误经 classifyKkHttpError 净化并附 requestId，不泄露上游 payload。
 */
import { NextResponse } from "next/server";
import { KkProfileServiceError } from "./profile.ts";
import { classifyKkHttpError } from "./error-classify.ts";

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
  const classified = classifyKkHttpError(error);
  return NextResponse.json(
    {
      success: false,
      error: classified.message === "Service is temporarily unavailable." ? defaultMessage : classified.message,
      code: classified.code,
      requestId: classified.requestId,
    },
    { status: classified.status },
  );
}
