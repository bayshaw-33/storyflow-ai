#!/usr/bin/env node
// scripts/seed-ai-prompts.mjs
// 从 lib/ai/prompts.ts 默认值写入 storyflow_ai_prompts 表。
// 用法: npx tsx scripts/seed-ai-prompts.mjs
// 需 .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// 手动读取 .env.local，避免引入 dotenv 依赖
function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(projectRoot, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // 去掉首尾引号
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local 不存在时静默跳过，依赖已有环境变量
  }
}

loadEnvLocal();

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE_KEY) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（请检查 .env.local）");
  process.exit(1);
}

// 动态导入 prompts.ts 默认值；tsx 直接运行 .ts 源码。
// prompts.ts 无静态 @/ 依赖（buildPrompt 内部用 dynamic import），可安全导入。
const { DEFAULT_RULES, DEFAULT_PROMPT_BY_TASK, taskNames } = await import("../lib/ai/prompts.ts");

const rows = [];
rows.push({ key: "rules:common", category: "rules", label: "通用规则", body: DEFAULT_RULES.common });
rows.push({ key: "rules:song", category: "rules", label: "歌曲规则", body: DEFAULT_RULES.song });
rows.push({ key: "rules:novel", category: "rules", label: "小说规则", body: DEFAULT_RULES.novel });
rows.push({ key: "rules:creation", category: "rules", label: "创作工作台规则", body: DEFAULT_RULES.creation });

for (const [taskType, body] of Object.entries(DEFAULT_PROMPT_BY_TASK)) {
  rows.push({
    key: `task:${taskType}`,
    category: "task",
    label: taskNames[taskType] || taskType,
    body,
  });
}

const resp = await fetch(`${SUPA_URL}/rest/v1/storyflow_ai_prompts?on_conflict=key`, {
  method: "POST",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  },
  body: JSON.stringify(rows),
});
if (!resp.ok) {
  console.error("seed 失败:", resp.status, await resp.text());
  process.exit(1);
}
console.log(`\u2713 已种子 ${rows.length} 条 AI prompts`);
