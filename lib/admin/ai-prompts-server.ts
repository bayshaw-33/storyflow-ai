import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";
import { DEFAULT_RULES, DEFAULT_PROMPT_BY_TASK, type TaskType } from "@/lib/ai/prompts";

type PromptRow = {
  key: string;
  category: "rules" | "task";
  label: string;
  body: string;
};

export type OverrideRow = {
  id: string;
  scope: "global" | "task_type";
  target: string;
  injection_text: string;
  position: "prepend" | "append";
  enabled: boolean;
};

type RulesName = keyof typeof DEFAULT_RULES;

type Cache = {
  rules: Map<string, string>; // common/song/novel/creation
  tasks: Map<string, string>; // taskType
  overrides: OverrideRow[];
  loadedAt: number;
};

let cache: Cache | null = null;
const CACHE_TTL_MS = 60_000; // 60s

function emptyCache(): Cache {
  return { rules: new Map(), tasks: new Map(), overrides: [], loadedAt: Date.now() };
}

/** 从 DB 拉取 prompts + overrides；带 60s 内存缓存；无 service role 或失败时回退空缓存。 */
export async function loadPromptsFromDb(): Promise<Cache> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  if (!hasServiceRoleConfig()) {
    cache = emptyCache();
    return cache;
  }
  try {
    const [rows, overrides] = await Promise.all([
      serviceFetch<PromptRow[]>(
        "/rest/v1/storyflow_ai_prompts?select=key,category,label,body",
      ),
      serviceFetch<OverrideRow[]>(
        "/rest/v1/storyflow_ai_prompt_overrides?select=id,scope,target,injection_text,position,enabled&enabled=eq.true&order=updated_at.asc",
      ),
    ]);
    const rules = new Map<string, string>();
    const tasks = new Map<string, string>();
    for (const r of rows) {
      if (r.category === "rules") {
        const name = r.key.replace("rules:", "");
        rules.set(name, r.body);
      } else {
        const taskType = r.key.replace("task:", "");
        tasks.set(taskType, r.body);
      }
    }
    cache = { rules, tasks, overrides, loadedAt: Date.now() };
  } catch {
    cache = emptyCache();
  }
  return cache;
}

/** 清空内存缓存，下次 loadPromptsFromDb 强制重新从 DB 拉取。 */
export function refreshPromptCache() {
  cache = null;
}

/** 取 rules：优先 DB 缓存，回退默认值。 */
export function resolveRules(name: RulesName, c: Cache): string {
  return c.rules.get(name) || DEFAULT_RULES[name];
}

/** 取 task prompt：优先 DB 缓存，回退默认值。 */
export function resolveTaskPrompt(taskType: TaskType, c: Cache): string {
  return c.tasks.get(taskType) || DEFAULT_PROMPT_BY_TASK[taskType];
}

/** 取生效 overrides：global + 该 taskType 的所有启用项。 */
export function getActiveOverrides(taskType: TaskType, c: Cache): OverrideRow[] {
  return c.overrides.filter((o) => o.scope === "global" || o.target === taskType);
}
