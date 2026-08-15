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

export async function fetchScreenplayStudio(input: RequestInfo | URL, init: RequestInit = {}) {
  const accessToken = await getScreenplayStudioAccessToken();
  return fetch(input, {
    ...init,
    headers: buildScreenplayStudioHeaders(accessToken, init.headers),
  });
}
