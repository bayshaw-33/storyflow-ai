import assert from "node:assert/strict";
import test from "node:test";

import { listProjectLibrary } from "../../../lib/server/v2/project-library/index.ts";
import { getProjectDeletePreflight } from "../../../lib/server/v2/project-library/lifecycle.ts";

test("project library aggregates primary projects and legacy child project tables", async () => {
  const calls = [];
  const rows = {
    projects: [{
      id: "script-1",
      title: "剧本项目",
      workflow_type: "script",
      status: "draft",
      user_id: "owner-1",
      owner_id: "owner-1",
      data: { idea: "一个故事" },
      created_at: "2026-08-10T00:00:00.000Z",
      updated_at: "2026-08-12T00:00:00.000Z",
    }],
    production: [{
      id: "production-1",
      project_id: "script-1",
      title: "剧本项目分镜",
      workflow_type: "storyboard",
      mode: "planning",
      source_unit_id: "episode-1",
      created_at: "2026-08-11T00:00:00.000Z",
      updated_at: "2026-08-13T00:00:00.000Z",
    }],
    art: [{
      id: "art-1",
      source_project_id: "script-1",
      name: "角色资产",
      status: "active",
      universe_id: "universe-1",
      created_at: "2026-08-09T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    }],
    viral: [{
      id: "viral-1",
      title: "改编项目",
      created_at: "2026-08-08T00:00:00.000Z",
      updated_at: "2026-08-15T00:00:00.000Z",
    }],
  };
  const fetcher = async (path) => {
    calls.push(path);
    if (path.startsWith("/rest/v1/storyflow_projects")) return rows.projects;
    if (path.startsWith("/rest/v1/storyflow_production_projects")) return rows.production;
    if (path.startsWith("/rest/v1/storyflow_art_projects")) return rows.art;
    if (path.startsWith("/rest/v1/storyflow_viral_projects")) return rows.viral;
    throw new Error(`unexpected path: ${path}`);
  };

  const result = await listProjectLibrary(fetcher, "owner-1");
  assert.deepEqual(result.map((item) => item.workflowType), ["viral", "art", "storyboard", "creation"]);
  assert.equal(result.find((item) => item.source === "production").sourceUnitId, "episode-1");
  assert.equal(result.find((item) => item.source === "art").sourceId, "art-1");
  assert.ok(calls.every((path) => path.includes("owner-1")));
});

test("project library excludes archived primary projects", async () => {
  const calls = [];
  await listProjectLibrary(async (path) => {
    calls.push(path);
    return [];
  }, "owner-1");
  assert.match(calls[0], /deleted_at=is\.null/);
});

test("empty owned primary project is safe to permanently delete", async () => {
  const calls = [];
  const result = await getProjectDeletePreflight(async (path) => {
    calls.push(path);
    if (path.startsWith("/rest/v1/storyflow_projects")) {
      return [{
        id: "empty-1",
        title: "测试空项目",
        owner_id: "owner-1",
        user_id: "owner-1",
        data: {},
      }];
    }
    return [];
  }, "owner-1", { source: "project", sourceId: "empty-1" });

  assert.equal(result.decision, "safe_to_delete");
  assert.equal(result.title, "测试空项目");
  assert.deepEqual(result.relatedCounts, {
    works: 0,
    screenplayUnits: 0,
    generationTasks: 0,
    assets: 0,
    universeLinks: 0,
  });
  assert.ok(calls.some((path) => path.startsWith("/rest/v1/storyflow_works")));
});

test("creative or linked primary project is archive-only", async () => {
  const result = await getProjectDeletePreflight(async (path) => {
    if (path.startsWith("/rest/v1/storyflow_projects")) {
      return [{
        id: "script-1",
        title: "真实剧本",
        owner_id: "owner-1",
        data: { outline: "有内容的大纲" },
      }];
    }
    if (path.startsWith("/rest/v1/storyflow_works")) return [{ id: "work-1" }];
    return [];
  }, "owner-1", { source: "project", sourceId: "script-1" });

  assert.equal(result.decision, "archive_only");
  assert.match(result.reason, /内容或关联/);
  assert.equal(result.relatedCounts.works, 1);
});

test("preflight hides foreign or absent project identity", async () => {
  const result = await getProjectDeletePreflight(async () => [], "owner-1", {
    source: "project",
    sourceId: "not-owned",
  });
  assert.equal(result.decision, "not_found");
});

test("project library lifecycle routes verify ownership and affected rows", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("app/api/v2/project-library/route.ts", "utf8");
  const preflightSource = readFileSync("app/api/v2/project-library/preflight-delete/route.ts", "utf8");
  const lifecycleSource = readFileSync("lib/server/v2/project-library/lifecycle.ts", "utf8");
  assert.match(source, /export async function DELETE/);
  assert.match(source, /export async function PATCH/);
  assert.match(source, /deletePreflightedProject/);
  assert.match(lifecycleSource, /storyflow_projects/);
  assert.match(lifecycleSource, /storyflow_production_projects/);
  assert.match(lifecycleSource, /storyflow_art_projects/);
  assert.match(lifecycleSource, /storyflow_viral_projects/);
  assert.match(lifecycleSource, /return=representation/);
  assert.match(lifecycleSource, /rows\.length !== 1/);
  assert.match(preflightSource, /getProjectDeletePreflight/);
});
