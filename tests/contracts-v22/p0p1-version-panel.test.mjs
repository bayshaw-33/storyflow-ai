/**
 * P1-02 — 版本面板与恢复（单元级不可变历史）。
 *
 * 撰写时 RED：版本抽屉只打印 currentVersionId/finalizedVersionId 裸 UUID，
 * 无历史列表、无作者/时间/来源/摘要、无恢复入口。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const { ScreenplayUnitsService } = await import("../../lib/server/v2/screenplays/units.ts");

const OWNER = "11111111-1111-1111-1111-111111111111";
const WORK = "22222222-2222-2222-2222-222222222222";
const UNIT = "33333333-3333-3333-3333-333333333333";

/** Minimal in-memory store shaped like Supabase REST for the unit tables. */
function makeStore() {
  const units = new Map([[UNIT, {
    id: UNIT, work_id: WORK, type: "scene", parent_id: null, order_index: 1,
    title: "第一场", readiness: "draft", current_version_id: null, finalized_version_id: null, legacy_id: null,
  }]]);
  const versions = [];
  const fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body) : null;
    if (method === "GET") {
      if (path.startsWith("/rest/v1/storyflow_works")) {
        return [{ id: WORK, owner_id: OWNER, project_id: "p-1", title: "t", status: "editing_draft", is_primary: true }];
      }
      if (path.startsWith("/rest/v1/storyflow_screenplay_unit_versions")) {
        let rows = [...versions];
        const idMatch = /[?&]id=eq\.([^&]+)/.exec(path);
        if (idMatch) rows = rows.filter((row) => row.id === idMatch[1]);
        const unitMatch = /[?&]unit_id=eq\.([^&]+)/.exec(path);
        if (unitMatch) rows = rows.filter((row) => row.unit_id === unitMatch[1]);
        const keyMatch = /[?&]idempotency_key=eq\.([^&]+)/.exec(path);
        if (keyMatch) rows = rows.filter((row) => row.idempotency_key === keyMatch[1]);
        if (path.includes("order=created_at.desc")) rows.reverse();
        return rows.slice(0, Number(/limit=(\d+)/.exec(path)?.[1] ?? 100));
      }
      if (path.startsWith("/rest/v1/storyflow_screenplay_units")) {
        return [...units.values()];
      }
      return [];
    }
    if (method === "POST" && path.startsWith("/rest/v1/storyflow_screenplay_unit_versions")) {
      const row = {
        id: `v-${versions.length + 1}`, work_id: WORK, unit_id: body.unit_id, parent_version_id: body.parent_version_id ?? null,
        content_schema: body.content_schema, content_json: body.content_json, content_hash: body.content_hash,
        source: body.source, source_message_ids: body.source_message_ids ?? [], idempotency_key: body.idempotency_key ?? "",
        created_at: new Date(2026, 0, 1, 0, 0, versions.length + 1).toISOString(),
      };
      versions.push(row);
      return [row];
    }
    if (method === "PATCH" && path.startsWith("/rest/v1/storyflow_screenplay_units")) {
      const id = /id=eq\.([^&]+)/.exec(path)[1];
      Object.assign(units.get(id), body);
      return [];
    }
    throw new Error(`unsupported ${method} ${path}`);
  };
  return { fetcher, units, versions };
}

test("listUnitVersions returns newest-first history with source, preview, and pointer flags", async () => {
  const store = makeStore();
  const service = new ScreenplayUnitsService(store.fetcher);
  const first = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: UNIT, content: { body: "第一版正文内容，包含足够长的句子用于摘要展示。" }, baseVersionId: null });
  const second = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: UNIT, content: { body: "第二版正文" }, baseVersionId: first.version.id });
  const history = await service.listUnitVersions({ ownerId: OWNER, workId: WORK, unitId: UNIT });
  assert.equal(history.length, 2);
  assert.equal(history[0].id, second.version.id, "newest first");
  assert.equal(history[0].isCurrent, true);
  assert.equal(history[0].source, "manual");
  assert.ok(history[1].preview.includes("第一版正文"), "preview from body");
  assert.equal(history[1].isCurrent, false);
});

test("restoreUnitVersion creates a NEW restore-sourced child; history stays append-only", async () => {
  const store = makeStore();
  const service = new ScreenplayUnitsService(store.fetcher);
  const first = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: UNIT, content: { body: "原始内容" }, baseVersionId: null });
  await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: UNIT, content: { body: "改后的内容" }, baseVersionId: first.version.id });

  const restored = await service.restoreUnitVersion({ ownerId: OWNER, workId: WORK, unitId: UNIT, versionId: first.version.id });
  assert.equal(store.versions.length, 3, "restore appends a third version");
  const restoreRow = store.versions.find((row) => row.id === restored.version.id);
  assert.equal(restoreRow.source, "restore");
  assert.equal(restoreRow.parent_version_id, store.versions[1].id, "parent is the current version at restore time");
  assert.deepEqual(restoreRow.content_json, { body: "原始内容" }, "content copied from the target");
  // 原版本行未被修改（append-only）
  assert.deepEqual(store.versions[0].content_json, { body: "原始内容" });
  assert.equal(store.units.get(UNIT).current_version_id, restored.version.id);
});

test("restoring the current version is a no-op (no redundant chain growth)", async () => {
  const store = makeStore();
  const service = new ScreenplayUnitsService(store.fetcher);
  const first = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: UNIT, content: { body: "a" }, baseVersionId: null });
  const second = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: UNIT, content: { body: "b" }, baseVersionId: first.version.id });

  const result = await service.restoreUnitVersion({ ownerId: OWNER, workId: WORK, unitId: UNIT, versionId: second.version.id });
  assert.equal(result.version.id, second.version.id, "current version restore returns itself");
  assert.equal(store.versions.length, 2, "no extra version appended");
});

test("studio version panel renders history with restore actions instead of raw UUIDs", () => {
  const source = read("../../components/v2/screenplay-studio/ScreenplayStudio.tsx");
  assert.doesNotMatch(source, /当前版本：\{activeUnit\?\.currentVersionId/, "raw pointer UUID line removed");
  assert.match(source, /listUnitVersions/, "panel loads the version history API");
  assert.match(source, /restoreUnitVersion/, "panel offers restore actions");
  assert.match(source, /恢复此版本/);
  assert.match(source, /VERSION_SOURCE_LABELS/, "sources are labeled in Chinese");
});
