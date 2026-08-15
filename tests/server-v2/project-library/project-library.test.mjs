import assert from "node:assert/strict";
import test from "node:test";

import { listProjectLibrary } from "../../../lib/server/v2/project-library/index.ts";

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

test("project library delete route exposes source-aware deletion", async () => {
  const source = await import("node:fs").then(({ readFileSync }) => readFileSync("app/api/v2/project-library/route.ts", "utf8"));
  assert.match(source, /export async function DELETE/);
  assert.match(source, /storyflow_projects/);
  assert.match(source, /storyflow_production_projects/);
  assert.match(source, /storyflow_art_projects/);
  assert.match(source, /storyflow_viral_projects/);
});
