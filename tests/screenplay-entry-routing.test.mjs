import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("existing screenplay projects enter the V2.2 screenplay studio", () => {
  const sources = [
    read("../components/home/ProjectList.tsx"),
    read("../components/universe/UniverseWorks.tsx"),
    read("../app/universes/[universeId]/page.tsx"),
    read("../lib/universe/graph.ts"),
  ];

  for (const source of sources) {
    assert.doesNotMatch(source, /novel-workbench\?projectId=/);
    assert.match(source, /script-workbench\?projectId=/);
  }
});

test("active creation entry points contain no novel module or route", () => {
  const workflow = read("../components/workflow/workflow-data.ts");
  const templates = read("../app/templates/page.tsx");
  const universe = read("../app/universes/[universeId]/page.tsx");
  assert.doesNotMatch(workflow, /id:\s*["']novel["']/);
  assert.doesNotMatch(workflow, /novel-workbench/);
  assert.doesNotMatch(templates, /novel|小说/);
  assert.doesNotMatch(universe, /value:\s*["']novel["']/);
  assert.doesNotMatch(universe, /createNovelProject/);
});

test("retired novel workbench is only a redirect and legacy storage is filtered by structured markers", () => {
  const retiredRoute = read("../app/novel-workbench/page.tsx");
  const projects = read("../lib/projects.ts");
  const supabaseProjects = read("../lib/supabase/projects.ts");
  const resolveWork = read("../app/api/v2/project-start/resolve-work/route.ts");
  assert.doesNotMatch(retiredRoute, /CreationWorkbench/);
  assert.match(retiredRoute, /projects\/new-v2/);
  assert.doesNotMatch(retiredRoute, /script-workbench\?projectId=/);
  assert.match(projects, /isRetiredNovelProject/);
  assert.match(projects, /filter\(\(project\) => !isRetiredNovelProject\(project\)\)/);
  assert.match(supabaseProjects, /isRetiredNovelProjectRow/);
  assert.match(supabaseProjects, /filter\(\(row\) => !isRetiredNovelProjectRow\(row\)\)/);
  assert.match(resolveWork, /isRetiredNovelRecord/);
  assert.match(supabaseProjects, /projects: visibleLocalProjects/);
});

test("the screenplay route resolves legacy project ids into ScreenplayStudio", () => {
  const source = read("../app/script-workbench/page.tsx");
  assert.match(source, /resolve-work\?projectId=/);
  assert.match(source, /<ScreenplayStudio \/>/);
});

test("homepage Hero enters the unified project-start grid instead of the retired modal", () => {
  const source = read("../app/page.tsx");
  assert.match(source, /router\.push\(["']\/projects\/new-v2["']\)/);
  assert.doesNotMatch(source, /useWorkspaceModal/);
  assert.doesNotMatch(source, /requestWorkspaceModalAfterLogin/);
  assert.doesNotMatch(source, /openModal\(\)/);
});
