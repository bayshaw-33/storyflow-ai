// 演员库客户端请求工具：统一携带 Bearer token，宽松解析 ok/apiError 响应。

export class ActorApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ActorApiError";
    this.status = status;
  }
}

export async function actorApiFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & { success?: boolean; error?: string };
  if (!response.ok || (data as { success?: boolean }).success === false) {
    throw new ActorApiError((data as { error?: string }).error || "请求失败。", response.status);
  }
  return data;
}
