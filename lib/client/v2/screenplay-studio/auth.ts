import { getSupabaseBrowserClient } from "../../../supabase/client.ts";

export function buildScreenplayStudioHeaders(
  accessToken: string | null,
  init?: HeadersInit,
) {
  const headers = new Headers(init);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

export async function getScreenplayStudioAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

interface ScreenplayAuthFetchDeps {
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export async function fetchWithScreenplayStudioAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
  deps: ScreenplayAuthFetchDeps,
) {
  const accessToken = await deps.getAccessToken();
  const response = await deps.fetcher(input, {
    ...init,
    headers: buildScreenplayStudioHeaders(accessToken, init.headers),
  });
  if (response.status !== 401) return response;

  const refreshedToken = await deps.refreshAccessToken().catch(() => null);
  if (!refreshedToken) return response;
  return deps.fetcher(input, {
    ...init,
    headers: buildScreenplayStudioHeaders(refreshedToken, init.headers),
  });
}

async function refreshScreenplayStudioAccessToken(): Promise<string | null> {
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

export async function fetchScreenplayStudio(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetchWithScreenplayStudioAuth(input, init, {
    getAccessToken: getScreenplayStudioAccessToken,
    refreshAccessToken: refreshScreenplayStudioAccessToken,
    fetcher: (request, options) => globalThis.fetch(request, options),
  });
}
