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
  const requestId = crypto.randomUUID();
  if (error instanceof KkProfileServiceError) {
    const retryable = error.status >= 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        requestId,
        retryable,
        retryAfter: retryable ? 5 : null,
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
      retryable: classified.status >= 500,
      retryAfter: classified.status >= 500 ? 5 : null,
    },
    { status: classified.status },
  );
}
