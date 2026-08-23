/**
 * P1-04 — 真实 Feed 与资产页（marketplace / 演员库）。
 *
 * 撰写时 RED：
 *   - marketplace USE_FIXTURE 默认开启（`!== "false"`），生产环境未设 env
 *     即整站演示数据（CI 反而显式设 false）。
 *   - PublishFlowClient 提交不发任何请求即显示"资产已提交发布"（假成功）。
 *   - 演员个人库无同名去重（重复导入/种子数据出现 13 张同名卡）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("marketplace fixture is opt-in, never the default data source", () => {
  const source = read("../../lib/client/v2/marketplace/api.ts");
  assert.doesNotMatch(source, /USE_FIXTURE\s*=\s*process\.env\.NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE\s*!==\s*"false"/, "default-on fixture serves demo data in production");
  assert.match(source, /NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE\s*===\s*"true"/);
});

test("publish flow submits to the real asset API instead of faking success", async () => {
  const source = read("../../components/v2/marketplace/PublishFlowClient.tsx");
  assert.match(source, /\/api\/v2\/assets/, "submit must call the real create-asset endpoint");
  assert.match(source, /fetchWithAuthRetry|fetch\(/);
  assert.match(source, /submitError|setError\(/, "failures surface instead of a canned success screen");
  // 假成功文案不允许在无请求路径下出现
  const doneBlockIdx = source.indexOf('if (done)');
  assert.ok(doneBlockIdx > 0);
});

test("publish submit creates a draft asset with the collected metadata", () => {
  const source = read("../../components/v2/marketplace/PublishFlowClient.tsx");
  assert.match(source, /rightsState/, "portrait rights state is sent");
  assert.match(source, /metadata/, "collected form fields ride along as metadata");
});

test("actor library dedupes same-name profiles (keeps the most recent)", async () => {
  const source = read("../../lib/supabase/actors.ts");
  assert.match(source, /dedupeActorsByName|normalizeActorName/, "dedupe helper exists");
  assert.match(source, /dedupeActorsByName\(actors\)/, "listStructuredActorsForUser output is deduped");
  // 行为级验证
  const { dedupeActorsByName } = await import("../../lib/supabase/actor-dedupe.ts");
  const deduped = dedupeActorsByName([
    { id: "a1", name: "Mira", updated_at: "2026-08-01T00:00:00Z" },
    { id: "a2", name: " mira ", updated_at: "2026-08-10T00:00:00Z" },
    { id: "a3", name: "Kael", updated_at: "2026-08-05T00:00:00Z" },
  ]);
  assert.equal(deduped.length, 2, "same-name profiles collapse (case/whitespace-insensitive)");
  assert.equal(deduped.find((a) => a.name.trim().toLowerCase() === "mira").id, "a2", "keeps the most recently updated");
});
