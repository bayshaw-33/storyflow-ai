#!/usr/bin/env node
/**
 * Supabase 目标库门禁 — 2026-08-16 错库事故后新增。
 *
 * 事故回顾：本地 CLI 一直链接 kiikis-staging（cwpyolxitkcpitqizgtq），
 * 而生产是 StoryFlow（vgcafbzksizlwmylphzu）；所有 V2.2 迁移都推到了
 * staging，生产库从未收到表，前端全量 503。
 *
 * 用法：
 *   node scripts/verify-supabase-target.mjs production   # 校验 CLI 链接 = 生产
 *   node scripts/verify-supabase-target.mjs staging      # 校验 CLI 链接 = staging
 *   node scripts/verify-supabase-target.mjs --status     # 只打印当前链接与两个库的身份
 *
 * 规则：
 *   - 退出码 0 = 链接符合预期；退出码 1 = 不符（应停止 db push / 写操作）。
 *   - --status 永远退出 0，只做展示。
 *   - 以 supabase/.temp/project-ref 为准；缺失时提示先 supabase link。
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TARGETS = {
  production: { ref: "vgcafbzksizlwmylphzu", name: "StoryFlow", note: "kiikis.com 实际连接的生产库（Seoul）" },
  staging: { ref: "cwpyolxitkcpitqizgtq", name: "kiikis-staging", note: "演练库（N. Virginia）" },
};

function readLinkedRef() {
  const p = path.join(ROOT, "supabase/.temp/project-ref");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8").trim();
}

function readEnvSupabaseUrl() {
  const p = path.join(ROOT, ".env.local");
  if (!existsSync(p)) return null;
  const m = readFileSync(p, "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m);
  return m ? m[1].trim() : null;
}

const arg = process.argv[2] ?? "--status";
const linked = readLinkedRef();
const envUrl = readEnvSupabaseUrl();
const envRef = envUrl ? (envUrl.match(/https:\/\/([a-z]{20})\.supabase\.co/)?.[1] ?? null) : null;

console.log("== Supabase 目标库门禁 ==");
console.log(`CLI 链接: ${linked ?? "（未链接）"}`);
for (const [key, t] of Object.entries(TARGETS)) {
  const mark = linked === t.ref ? "← 当前链接" : "";
  console.log(`  ${key.padEnd(10)} ${t.ref}  ${t.name}  ${t.note} ${mark}`);
}
if (envRef) {
  const envLabel = Object.entries(TARGETS).find(([, t]) => t.ref === envRef)?.[0] ?? "未知库！";
  console.log(`本机 .env.local 指向: ${envRef}（${envLabel}）`);
}

if (arg === "--status") process.exit(0);

const target = TARGETS[arg];
if (!target) {
  console.error(`未知目标 "${arg}"。可用：production | staging | --status`);
  process.exit(2);
}
if (linked !== target.ref) {
  console.error(`\n✖ 门禁不通过：当前 CLI 链接不是 ${arg}（${target.ref} / ${target.name}）。`);
  console.error("  如需切换：supabase link --project-ref " + target.ref);
  console.error("  任何 db push / 写操作前必须先通过本门禁。");
  process.exit(1);
}
console.log(`\n✔ 门禁通过：CLI 链接即 ${arg}（${target.name}）。`);
