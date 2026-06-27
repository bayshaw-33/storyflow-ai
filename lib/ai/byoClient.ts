import type { ByoApiConfig } from "@/lib/ai/prompts";

const BYO_API_STORAGE_KEY = "kiikis_byo_api_config";

export function readByoApiConfig(): ByoApiConfig | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(BYO_API_STORAGE_KEY) || "null") as ByoApiConfig | null;
    if (!parsed) return undefined;
    const config: ByoApiConfig = {
      provider: parsed.provider || "auto",
      deepseekApiKey: parsed.deepseekApiKey?.trim() || undefined,
      deepseekModel: parsed.deepseekModel?.trim() || undefined,
      minimaxApiKey: parsed.minimaxApiKey?.trim() || undefined,
      minimaxModel: parsed.minimaxModel?.trim() || undefined,
      minimaxBaseUrl: parsed.minimaxBaseUrl?.trim() || undefined,
    };
    return config.deepseekApiKey || config.minimaxApiKey ? config : undefined;
  } catch {
    return undefined;
  }
}
