/**
 * P0-01 共享认证 fetch：401 → refreshSession → 重试一次。
 *
 * 根因：客户端 session 持久化在 localStorage，调用点捕获的
 * `session.access_token` 在空闲/休眠后可能过期；supabase-js 的
 * autoRefreshToken 不保证调用瞬间 token 新鲜。唯一带重试的封装
 * （screenplay-studio/auth.ts）未共享，其余对话面（KK runtime、
 * 美术助理、分镜、创作台）过期即失败，服务端回 401"请先登录"，
 * 用户实际已登录。
 *
 * 语义：
 *   - 每次调用前重新 getSession 取最新 token（不依赖捕获值）；
 *   - 401 时 refreshSession 一次，拿新 token 重试一次；刷新失败原样返回 401；
 *   - 幂等键由调用方保证；本封装不重放非 401 失败。
 *
 * deps 可注入，便于 node --test 直接测（不依赖 supabase 浏览器客户端）。
 */
import { getSupabaseBrowserClient } from "../../supabase/client.ts";

export interface AuthFetchDeps {
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

async function defaultGetAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function defaultRefreshAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export const defaultAuthFetchDeps: AuthFetchDeps = {
  getAccessToken: defaultGetAccessToken,
  refreshAccessToken: defaultRefreshAccessToken,
  fetcher: (input, init) => globalThis.fetch(input, init),
};

/** 仅对字符串 body（JSON）默认 Content-Type；FormData 等由浏览器自行设置边界。 */
export function buildAuthHeaders(accessToken: string | null, init?: { headers?: HeadersInit; body?: BodyInit | null }): Headers {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  deps: AuthFetchDeps = defaultAuthFetchDeps,
): Promise<Response> {
  const accessToken = await deps.getAccessToken();
  const response = await deps.fetcher(input, {
    ...init,
    headers: buildAuthHeaders(accessToken, init),
  });
  if (response.status !== 401) return response;

  const refreshedToken = await deps.refreshAccessToken();
  if (!refreshedToken) return response;
  return deps.fetcher(input, {
    ...init,
    headers: buildAuthHeaders(refreshedToken, init),
  });
}
