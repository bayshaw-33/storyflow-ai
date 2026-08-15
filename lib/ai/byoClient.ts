import type { ByoApiConfig } from "@/lib/ai/prompts";

const BYO_API_STORAGE_KEY = "kiikis_byo_api_config";
const WORKFLOW_MODEL_ROUTING_KEY = "kiikis_workflow_model_routing";

export type WorkflowModelRoute = "script" | "song" | "viral" | "storyboard" | "video";
export type WorkflowModelRouting = Partial<Record<WorkflowModelRoute, string>>;

export function readByoApiConfig(workflow?: WorkflowModelRoute): ByoApiConfig | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const connectionId = workflow ? readWorkflowModelRouting()[workflow] : "";
    if (connectionId) return { provider: "auto", connectionId };

    const parsed = JSON.parse(window.localStorage.getItem(BYO_API_STORAGE_KEY) || "null") as ByoApiConfig | null;
    if (!parsed) return undefined;
    const config: ByoApiConfig = {
      provider: parsed.provider || "auto",
      connectionId: parsed.connectionId?.trim() || undefined,
      deepseekApiKey: parsed.deepseekApiKey?.trim() || undefined,
      deepseekModel: parsed.deepseekModel?.trim() || undefined,
      minimaxApiKey: parsed.minimaxApiKey?.trim() || undefined,
      minimaxModel: parsed.minimaxModel?.trim() || undefined,
      minimaxBaseUrl: parsed.minimaxBaseUrl?.trim() || undefined,
      customProviderName: parsed.customProviderName?.trim() || undefined,
      customApiKey: parsed.customApiKey?.trim() || undefined,
      customModel: parsed.customModel?.trim() || undefined,
      customBaseUrl: parsed.customBaseUrl?.trim() || undefined,
    };
    return config.connectionId || config.deepseekApiKey || config.minimaxApiKey || config.customApiKey ? config : undefined;
  } catch {
    return undefined;
  }
}

export function readWorkflowModelRouting(): WorkflowModelRouting {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKFLOW_MODEL_ROUTING_KEY) || "{}") as WorkflowModelRouting;
    if (!parsed || typeof parsed !== "object") return {};
    const { novel: _retiredNovelRoute, ...activeRoutes } = parsed as WorkflowModelRouting & { novel?: string };
    return activeRoutes;
  } catch {
    return {};
  }
}

export function writeWorkflowModelRouting(routing: WorkflowModelRouting) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKFLOW_MODEL_ROUTING_KEY, JSON.stringify(routing));
}
