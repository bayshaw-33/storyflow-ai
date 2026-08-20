#!/usr/bin/env node
/**
 * KIIKIS V2.2 发布 smoke — Phase 6 Task 6.5 Step 4.
 *
 * 六条 Journey 的最小可运行检查（真实环境）+ 本地静态 smoke：
 *   - 本地：audit 脚本、契约测试、安全测试、性能测试全部通过
 *   - 真实环境：六条 smoke 探测（缺凭据时报告阻塞，不伪造成功）
 *
 * 用法：node scripts/smoke-kiikis-22.mjs
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf8" });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? "") + String(error.stderr ?? "") };
  }
}

const JOURNEYS = [
  { id: "a-screenplay", path: "/production?tab=script", check: "production-script" },
  { id: "b-universe", path: "/universes", check: "universes" },
  { id: "c-import", path: "/universes/import/missing-session", check: "universe-import" },
  { id: "d-song", path: "/song-workbench", check: "song-workbench" },
  { id: "e-jobs-kk", path: "/tasks", check: "tasks" },
  { id: "f-market", path: "/community", check: "community" },
];

const PRODUCTION_STAGES = ["script", "art", "storyboard", "video"];

async function main() {
  const results = [];
  console.log("=== KIIKIS 2.2 smoke ===");

  // 1. 本地审计（必须全过）
  const audits = [
    ["contracts", "node scripts/audit-kiikis-22-contracts.mjs"],
    ["runtime", "node scripts/audit-kiikis-22-runtime.mjs"],
    ["migrations", "node scripts/audit-kiikis-22-migrations.mjs"],
  ];
  for (const [name, cmd] of audits) {
    const r = run(cmd);
    results.push({ step: `audit:${name}`, ok: r.ok });
    console.log(`${r.ok ? "✅" : "❌"} audit:${name}`);
    if (!r.ok) process.exitCode = 1;
  }

  // 2. 关键测试套件（快速子集）
  const testSuites = [
    "tests/contracts-v22/prd-coverage.test.mjs tests/contracts-v22/backward-compatibility.test.mjs",
    "tests/security/kiikis-22-rls.test.mjs tests/security/kiikis-22-storage.test.mjs",
    "tests/performance/v22-screenplay-budget.test.mjs tests/performance/v22-import-budget.test.mjs",
  ];
  for (const suite of testSuites) {
    const r = run(`node --test ${suite}`);
    results.push({ step: `test:${suite.split("/").pop()}`, ok: r.ok });
    console.log(`${r.ok ? "✅" : "❌"} test ${suite}`);
    if (!r.ok) process.exitCode = 1;
  }

  // 3. 真实环境 Journey 探测（缺凭据时如实报告）
  const baseUrl = process.env.KIIKIS_SMOKE_BASE_URL;
  if (!baseUrl) {
    console.log("ℹ KIIKIS_SMOKE_BASE_URL 未设置：跳过真实环境 Journey 探测（不伪造成功）。");
    console.log("   本地验证以 audit + 测试套件为准；真实 smoke 需环境变量。");
  } else {
    for (const journey of JOURNEYS) {
      try {
        const response = await fetch(`${baseUrl}${journey.path}`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
        const ok = response.status < 500;
        results.push({ step: `journey:${journey.id}`, ok, note: `HTTP ${response.status}` });
        console.log(`${ok ? "✅" : "❌"} journey:${journey.id} HTTP ${response.status}`);
      } catch (error) {
        results.push({ step: `journey:${journey.id}`, ok: false });
        console.log(`❌ journey:${journey.id} unreachable: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    }
    for (const stage of PRODUCTION_STAGES) {
      try {
        const response = await fetch(`${baseUrl}/production?tab=${stage}`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
        const ok = response.status < 500;
        results.push({ step: `production:${stage}`, ok, note: `HTTP ${response.status}` });
        console.log(`${ok ? "✅" : "❌"} production:${stage} HTTP ${response.status}`);
      } catch (error) {
        results.push({ step: `production:${stage}`, ok: false });
        console.log(`❌ production:${stage} unreachable: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.error(`❌ smoke 未通过：${failed} 项失败。`);
  } else {
    console.log("✅ 本地 smoke 全部通过（audit + 契约 + 安全 + 性能）。");
  }
}

await main();
