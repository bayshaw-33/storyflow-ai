#!/usr/bin/env node
/**
 * KIIKIS V2.2 Runtime / fixture 发布审计 — Phase 6 Task 6.2 Step 1.
 *
 * fail-closed 规则：
 *   - NODE_ENV=production（或 VERCEL_ENV=production）时，任何
 *     NEXT_PUBLIC_USE_*_FIXTURE 开关不得为 true。
 *   - 对 `!== "false"` 语义的历史开关（未显式设 false 即启用），production
 *     下必须显式为 false 或直接未设置且被代码 fail-closed。
 *   - staging/preview 同样执行（显式 true 才允许，且必须显示 demo 标记）。
 *
 * 用法：node scripts/audit-kiikis-22-runtime.mjs [--env=production|staging]
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FIXTURE_ENV_RE = /NEXT_PUBLIC_USE_[A-Z0-9_]+_FIXTURE/g;
// 只在赋值语句中判定语义（忽略注释里的历史文案）
const LENIENT_ASSIGN_RE = /(?:const|let)\s+\w+\s*=\s*(?:process\.env\.|env\.)?NEXT_PUBLIC_USE_[A-Z0-9_]+_FIXTURE\s*!==\s*["']false["']/;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

/** 从客户端源码提取所有 fixture 开关及其语义（默认开/默认关）。 */
function collectFixtureSwitches() {
  const switches = new Map(); // envName -> { lenient: boolean, files: string[] }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const src = readFileSync(full, "utf8");
        for (const match of src.matchAll(FIXTURE_ENV_RE)) {
          const envName = match[0];
          const line = src.slice(0, match.index).split("\n").pop() ?? "";
          const near = src.slice(Math.max(0, match.index - 120), match.index + 80);
          const lenient = LENIENT_ASSIGN_RE.test(near);
          if (!switches.has(envName)) switches.set(envName, { lenient, files: [] });
          const entry = switches.get(envName);
          entry.files.push(full.replace(root + "/", ""));
        }
      }
    }
  };
  walk(resolve(root, "lib/client/v2"));
  walk(resolve(root, "lib/client/v2/kk"));
  walk(resolve(root, "lib/client/v2/short-drama"));
  walk(resolve(root, "lib/client/v2/marketplace"));
  return switches;
}

function main() {
  const envArg = process.argv.find((a) => a.startsWith("--env="))?.slice(6) ?? "production";
  const mode = envArg === "staging" ? "staging" : "production";
  const nodeEnv = mode === "production" ? "production" : "production"; // staging 也按 production-like 审计
  const switches = collectFixtureSwitches();

  if (switches.size === 0) {
    fail("未发现任何 NEXT_PUBLIC_USE_*_FIXTURE 开关（或路径扫描失败）。");
    return;
  }

  let violations = 0;
  for (const [envName, info] of switches) {
    const raw = process.env[envName];
    if (info.lenient) {
      // `!== "false"` 语义：显式 false 才安全
      if (raw !== "false") {
        violations += 1;
        fail(`${mode} 环境：${envName} 为默认启用语义（!== "false"）且当前值=${raw ?? "未设置"} → fixture 泄漏风险（来源 ${info.files.join(", ")}）`);
      } else {
        console.log(`  ✓ ${envName}=false（显式关闭，安全）`);
      }
    } else if (raw === "true" || raw === "1") {
      violations += 1;
      fail(`${mode} 环境：${envName}=${raw} → production 禁止 fixture（来源 ${info.files.join(", ")}）`);
    } else {
      console.log(`  ✓ ${envName}=${raw ?? "未设置"}（fail-closed）`);
    }
  }

  if (violations > 0) {
    console.error(`❌ Runtime fixture 审计未通过（${mode}）：${violations} 处违规。`);
    return;
  }
  console.log(`✅ Runtime fixture 审计通过（${mode}）：${switches.size} 个开关全部 fail-closed。`);
}

main();
