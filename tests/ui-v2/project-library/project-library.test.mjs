import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAndSortProjects,
  getProjectProgress,
  getProjectWorkbenchHref,
} from "../../../lib/client/v2/project-library/helpers.ts";

function project(overrides = {}) {
  return {
    id: "p-1",
    title: "婚姻契约",
    workflowType: "creation",
    status: "draft",
    projectGroup: "默认分组",
    universeId: null,
    idea: "",
    brief: "",
    characters: "",
    outline: "",
    episodes: "",
    finalScript: "",
    continuationScript: "",
    stepVersions: [],
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}

test("project library filters by title, workflow, status, and Universe binding", () => {
  const projects = [
    project({ id: "script-1", title: "婚姻契约", workflowType: "creation", status: "draft", universeId: "uni-1" }),
    project({ id: "song-1", title: "Lullaby", workflowType: "song", status: "ready", universeId: null }),
  ];

  assert.deepEqual(
    filterAndSortProjects(projects, { query: "婚姻", workflow: "all", status: "all", universe: "all", sort: "updated" }).map((p) => p.id),
    ["script-1"],
  );
  assert.deepEqual(
    filterAndSortProjects(projects, { query: "", workflow: "song", status: "all", universe: "all", sort: "updated" }).map((p) => p.id),
    ["song-1"],
  );
  assert.deepEqual(
    filterAndSortProjects(projects, { query: "", workflow: "all", status: "ready", universe: "unbound", sort: "updated" }).map((p) => p.id),
    ["song-1"],
  );
});

test("project library keeps a draft screenplay with no completed progress", () => {
  const draft = project({ id: "draft-1", title: "尚未开始的剧本", workflowType: "creation" });
  const visible = filterAndSortProjects([draft], { query: "", workflow: "all", status: "all", universe: "all", sort: "updated" });
  assert.deepEqual(visible.map((p) => p.id), ["draft-1"]);
  assert.equal(getProjectProgress(draft), 0);
});

test("project library excludes only structured retired novel records", () => {
  const retiredNovel = project({ id: "novel-1", title: "旧小说", workflowType: "novel" });
  const screenplay = project({ id: "script-1", title: "剧本草稿", workflowType: "creation" });
  const visible = filterAndSortProjects([retiredNovel, screenplay], { query: "", workflow: "all", status: "all", universe: "all", sort: "updated" });
  assert.deepEqual(visible.map((p) => p.id), ["script-1"]);
});

test("project library sorts by title, creation time, and update time", () => {
  const projects = [
    project({ id: "b", title: "乙", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z" }),
    project({ id: "a", title: "甲", createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z" }),
  ];
  const base = { query: "", workflow: "all", status: "all", universe: "all" };
  assert.deepEqual(filterAndSortProjects(projects, { ...base, sort: "title" }).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(filterAndSortProjects(projects, { ...base, sort: "created" }).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(filterAndSortProjects(projects, { ...base, sort: "updated" }).map((p) => p.id), ["b", "a"]);
});

test("project library routes audiovisual projects into production and preserves professional routes", () => {
  assert.equal(getProjectWorkbenchHref(project({ id: "script-1", workflowType: "creation" })), "/production?projectId=script-1&tab=script&unitId=project-script-1");
  assert.equal(getProjectWorkbenchHref(project({ id: "song-1", workflowType: "song" })), "/song-workbench?projectId=song-1");
  assert.equal(getProjectWorkbenchHref(project({ id: "storyboard-1", workflowType: "storyboard" })), "/production?projectId=storyboard-1&tab=storyboard&unitId=project-storyboard-1");
  assert.equal(getProjectWorkbenchHref(project({ id: "video-1", workflowType: "video" })), "/production?projectId=video-1&tab=video&unitId=project-video-1");
  assert.equal(getProjectWorkbenchHref(project({ id: "art-1", workflowType: "art" })), "/production?projectId=art-1&tab=art&unitId=project-art-1");
  assert.equal(getProjectWorkbenchHref(project({ id: "voice-1", workflowType: "voice" })), "/casting?projectId=voice-1");
  assert.equal(getProjectWorkbenchHref(project({ id: "editing-1", workflowType: "editing" })), "/editor?projectId=editing-1&sourceUnitId=project-editing-1");
  assert.equal(getProjectWorkbenchHref(project({ id: "viral-source", workflowType: "viral" })), "/viral-workbench?projectId=source&dashboardProjectId=viral-source");
});

test("project library records preserve their source identity for safe deletion", async () => {
  const { toProjectLibraryRecord } = await import("../../../lib/client/v2/project-library/types.ts");
  const record = toProjectLibraryRecord({
    id: "art-1",
    title: "角色资产",
    workflowType: "art",
    source: "art",
    sourceId: "art-row-1",
    status: "active",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  });
  assert.equal(record.source, "art");
  assert.equal(record.sourceId, "art-row-1");
  assert.equal(record.workflowType, "art");
});
