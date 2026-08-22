/**
 * P0-01 — KK HTTP 错误分类（纯函数，无 next/server 依赖，可进 node 测试）。
 *
 * 根因：authenticateRequest 抛的 MISSING_AUTH_TOKEN / INVALID_AUTH_TOKEN
 * 不是 KkProfileServiceError，被 kkProfileErrorResponse 兜底成 503
 * service_unavailable；客户端先判 503，于是过期 token 呈现为
 * "KK 服务不可用/离线"，而不是引导重登 —— 已登录用户看到伪错误。
 */
import { classifyServiceError } from "../service-errors.ts";

export interface KkHttpErrorClassification {
  status: number;
  code: string;
  /** Safe message — never leaks the raw upstream payload. */
  message: string;
  requestId: string;
}

const AUTH_ERROR_MESSAGES = new Set(["MISSING_AUTH_TOKEN", "INVALID_AUTH_TOKEN"]);

export function classifyKkHttpError(error: unknown): KkHttpErrorClassification {
  const message = error instanceof Error ? error.message : String(error ?? "");

  // 认证失败是 401：客户端据此提示重新登录，而不是把 KK 标记为离线
  if (AUTH_ERROR_MESSAGES.has(message)) {
    return {
      status: 401,
      code: "unauthenticated",
      message: "请先登录后再使用 KK。",
      requestId: `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  // 其余（配置缺失、Supabase 故障、网络失败）走统一净化分类，
  // 附 requestId 供追踪；原始 payload 只进服务端日志
  const classified = classifyServiceError(error, "api/v2/kk");
  return {
    status: classified.status,
    code: classified.code,
    message: classified.message,
    requestId: classified.requestId,
  };
}
