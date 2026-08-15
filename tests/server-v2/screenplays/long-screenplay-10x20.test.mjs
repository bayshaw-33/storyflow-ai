/**
 * K22-P3 long-screenplay validation.
 *
 * This is a deterministic acceptance fixture for the intended screenplay
 * scale: 10 episodes × 20 scenes. It exercises the structural contract,
 * full continuity indexing, localized findings, and one-scene incremental
 * reindexing without requiring a live provider or database.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SCREENPLAY_DOCUMENT_V1_SCHEMA,
  assertScreenplayDocumentV1,
} from "../../../lib/contracts/v2/screenplay-studio.ts";
import { ScreenplayContinuityService } from "../../../lib/server/v2/screenplays/continuity.ts";

const OWNER = "owner-long-screenplay";
const WORK = "work-long-screenplay";
const EPISODE_COUNT = 10;
const SCENES_PER_EPISODE = 20;

function makeStore() {
  const tables = {
    storyflow_works: [{ id: WORK, owner_id: OWNER }],
    storyflow_screenplay_units: [],
    storyflow_screenplay_unit_versions: [],
    storyflow_continuity_index: [],
    storyflow_continuity_findings: [],
    storyflow_evidence_events: [],
  };
  let sequence = 0;

  const nextId = (table) => `${table}-${String(++sequence).padStart(4, "0")}`;

  const matches = (row, key, expression) => {
    const filter = /^(eq|in|is)\.(.*)$/.exec(expression);
    if (!filter) return String(row[key]) === expression;
    if (filter[1] === "eq") return String(row[key]) === filter[2];
    if (filter[1] === "is") return filter[2] === "null" ? row[key] === null : String(row[key]) === filter[2];
    const values = filter[2].replace(/^\(|\)$/g, "").split(",");
    return values.includes(String(row[key]));
  };

  const fetcher = async (path, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://long-screenplay.test");
    const tableName = url.pathname.replace("/rest/v1/", "");
    const rows = tables[tableName] ?? [];
    const filters = [...url.searchParams.entries()].filter(([key]) => !["select", "order", "limit"].includes(key));

    if (method === "GET") {
      let result = rows.filter((row) => filters.every(([key, expression]) => matches(row, key, expression)));
      const order = url.searchParams.get("order");
      if (order) {
        const [field, direction] = order.split(".");
        result = [...result].sort((a, b) => {
          const left = String(a[field] ?? "");
          const right = String(b[field] ?? "");
          return direction === "desc" ? right.localeCompare(left) : left.localeCompare(right);
        });
      }
      const limit = Number(url.searchParams.get("limit") ?? result.length);
      result = result.slice(0, limit);
      const select = url.searchParams.get("select");
      if (select) {
        const fields = select.split(",");
        result = result.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
      }
      return result;
    }

    if (method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const inserted = (Array.isArray(body) ? body : [body]).map((value) => ({
        ...value,
        id: value.id ?? nextId(tableName),
        created_at: value.created_at ?? new Date(1700000000000 + sequence * 1000).toISOString(),
      }));
      rows.push(...inserted);
      return inserted;
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const targets = rows.filter((row) => filters.every(([key, expression]) => matches(row, key, expression)));
      for (const target of targets) Object.assign(target, body);
      return targets;
    }

    if (method === "DELETE") {
      const kept = rows.filter((row) => !filters.every(([key, expression]) => matches(row, key, expression)));
      rows.splice(0, rows.length, ...kept);
      return [];
    }

    throw new Error(`Unsupported method: ${method}`);
  };

  return { fetcher, tables };
}

function buildLongScreenplay() {
  const units = [];
  const versions = [];

  for (let episode = 1; episode <= EPISODE_COUNT; episode += 1) {
    const episodeId = `episode-${String(episode).padStart(2, "0")}`;
    units.push({
      id: episodeId,
      work_id: WORK,
      type: "episode",
      parent_id: null,
      order_index: episode,
      title: `第${episode}集`,
      readiness: "draft",
      current_version_id: null,
    });

    for (let scene = 1; scene <= SCENES_PER_EPISODE; scene += 1) {
      const sceneId = `e${String(episode).padStart(2, "0")}-s${String(scene).padStart(2, "0")}`;
      const versionId = `version-${sceneId}`;
      const hasNameTypo = episode === 7 && scene === 13;
      const names = hasNameTypo ? ["林澈", "林彻"] : ["林澈", "沈砚"];
      const body = hasNameTypo
        ? `夜，旧码头。林澈确认信号，林彻在远处回应，林澈决定继续前进。`
        : `夜，旧码头。林澈确认信号，沈砚在远处回应，林澈决定继续前进，沈砚跟上。`;
      units.push({
        id: sceneId,
        work_id: WORK,
        type: "scene",
        parent_id: episodeId,
        order_index: scene,
        title: `第${episode}集 第${scene}场`,
        readiness: "draft",
        current_version_id: versionId,
      });
      versions.push({
        id: versionId,
        work_id: WORK,
        unit_id: sceneId,
        content_json: { body, names },
      });
    }
  }

  return { units, versions };
}

test("validates a 10-episode × 20-scene screenplay at continuity scale", async () => {
  const store = makeStore();
  const fixture = buildLongScreenplay();
  store.tables.storyflow_screenplay_units.push(...fixture.units);
  store.tables.storyflow_screenplay_unit_versions.push(...fixture.versions);

  assert.equal(fixture.units.length, 210, "10 episodes + 200 scenes");
  assert.equal(fixture.versions.length, 200, "one current version per scene");
  assert.doesNotThrow(() => assertScreenplayDocumentV1({
    schemaVersion: SCREENPLAY_DOCUMENT_V1_SCHEMA,
    workId: WORK,
    units: fixture.units.map((unit) => ({
      id: unit.id,
      type: unit.type,
      parentId: unit.parent_id,
      order: unit.order_index,
      title: unit.title,
      readiness: unit.readiness,
      dependencyState: "current",
      currentVersionId: unit.current_version_id,
      workId: WORK,
    })),
  }));

  const service = new ScreenplayContinuityService(store.fetcher);
  const fullIndex = await service.reindexAll({ ownerId: OWNER, workId: WORK });
  assert.equal(fullIndex.reindexedVersionIds.length, 200);
  assert.ok(store.tables.storyflow_continuity_index.length >= 799, "all 200 scenes are indexed");

  const analysis = await service.analyze({ ownerId: OWNER, workId: WORK });
  const nameFinding = analysis.findings.find((finding) => finding.kind === "name_inconsistency");
  assert.ok(nameFinding, "the intentional long-screenplay typo is detected");
  assert.ok(nameFinding.locations.some((location) => (
    location.episodeId === "episode-07"
    && location.sceneId === "e07-s13"
    && location.unitVersionId === "version-e07-s13"
    && location.textEnd >= location.textStart
  )));

  const target = store.tables.storyflow_screenplay_unit_versions.find((version) => version.unit_id === "e03-s09");
  assert.ok(target);
  const otherIndexBefore = JSON.stringify(
    store.tables.storyflow_continuity_index
      .filter((entry) => entry.unit_id !== "e03-s09")
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
  target.content_json = {
    body: "夜，旧码头。林澈确认新信号，沈砚在远处回应，林澈决定返回。",
    names: ["林澈", "沈砚"],
  };

  const incremental = await service.reindexUnit({ ownerId: OWNER, workId: WORK, unitId: "e03-s09" });
  assert.deepEqual(incremental.reindexedVersionIds, ["version-e03-s09"]);
  assert.equal(
    JSON.stringify(
      store.tables.storyflow_continuity_index
        .filter((entry) => entry.unit_id !== "e03-s09")
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
    otherIndexBefore,
    "incremental reindex leaves the other 199 scenes untouched",
  );
  assert.ok(store.tables.storyflow_continuity_index.some((entry) => entry.unit_id === "e03-s09" && entry.term === "林澈"));
});
