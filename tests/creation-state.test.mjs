import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreationWorkspace,
  finalizeUnit,
  normalizeCreationWorkspace,
  recordCreationPosition,
  unfinalizeDocument,
  unfinalizeEpisodePlan,
  unfinalizeUnit,
  updateCreationUnit,
} from "../lib/creation/state.ts";
import { normalizeStoredProject } from "../lib/projects.ts";

test("maps legacy creation fields into the V2 shared documents", () => {
  const project = normalizeStoredProject({
    id: "legacy-project",
    workflowType: "novel",
    novelBrief: "Legacy background",
    novelCharacters: "Legacy characters",
    novelBible: "Legacy plot",
    novelChapters: [
      {
        id: "chapter-1",
        chapterNo: 1,
        title: "Arrival",
        outline: "The lead arrives.",
        draft: "Chapter body",
        endingHook: "A locked door opens.",
        pov: "Lara",
        wordCount: 2,
        continuityNotes: "Red coat",
        status: "reviewed",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(project.creationWorkspace?.documents.backgroundWorld.content, "Legacy background");
  assert.equal(project.creationWorkspace?.documents.characterBible.content, "Legacy characters");
  assert.equal(project.creationWorkspace?.documents.plotOutline.content, "Legacy plot");
  assert.equal(project.creationWorkspace?.novel.units.length, 1);
  assert.equal(project.creationWorkspace?.novel.units[0].content, "Chapter body");
  // PRD V1.0：reviewed/locked 归一化为 finalized（内容原样保留）
  assert.equal(project.creationWorkspace?.novel.units[0].status, "finalized");
  assert.deepEqual(project.creationWorkspace?.screenplay.units, []);

  assert.equal(project.novelBrief, "Legacy background");
  assert.equal(project.novelCharacters, "Legacy characters");
  assert.equal(project.novelBible, "Legacy plot");
});

test("keeps novel and screenplay units in independent stores", () => {
  const workspace = createCreationWorkspace({
    title: "Two formats",
    novelChapters: [
      {
        id: "chapter-1",
        chapterNo: 1,
        title: "Novel one",
        outline: "",
        draft: "Novel draft",
        endingHook: "",
        pov: "",
        wordCount: 2,
        continuityNotes: "",
        status: "draft",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const withScreenplay = normalizeCreationWorkspace(
    {
      ...workspace,
      screenplay: {
        ...workspace.screenplay,
        units: [
          {
            id: "episode-1",
            number: 1,
            title: "Episode one",
            outline: "",
            content: "Screenplay draft",
            screenplay: null,
            continuityNotes: "",
            status: "draft",
            versions: [],
            translation: "",
            localizedContent: "",
            localizationChanges: "",
            similarityReport: "",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    {},
  );

  const novelUpdated = updateCreationUnit(withScreenplay, "novel", "chapter-1", { content: "Novel revision" });
  assert.equal(novelUpdated.novel.units[0].content, "Novel revision");
  assert.equal(novelUpdated.screenplay.units[0].content, "Screenplay draft");

  const screenplayUpdated = updateCreationUnit(novelUpdated, "screenplay", "episode-1", { content: "Script revision" });
  assert.equal(screenplayUpdated.novel.units[0].content, "Novel revision");
  assert.equal(screenplayUpdated.screenplay.units[0].content, "Script revision");
});

test("editing a finalized unit applies the edit and demotes it to draft (PRD V1.0)", () => {
  const workspace = createCreationWorkspace({
    novelChapters: [
      {
        id: "locked-chapter",
        chapterNo: 1,
        title: "Locked",
        outline: "",
        draft: "Approved text",
        endingHook: "",
        pov: "",
        wordCount: 2,
        continuityNotes: "",
        status: "locked", // 归一化后为 finalized
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  assert.equal(workspace.novel.units[0].status, "finalized", "locked 归一化为 finalized");

  // 用户手动编辑：内容应用且状态自动降级为草稿（不再抛错阻断）
  const edited = updateCreationUnit(workspace, "novel", "locked-chapter", { content: "Deliberate revision" });
  assert.equal(edited.novel.units[0].content, "Deliberate revision");
  assert.equal(edited.novel.units[0].status, "draft");
  // 原工作区不可变（append-only 语义）
  assert.equal(workspace.novel.units[0].content, "Approved text");
  // AI 生成路径的定稿保护见 tests/creation-parsers.test.mjs（finalize 单元记为失败，不覆盖）
});

test("records and normalizes the last creation position", () => {
  const workspace = createCreationWorkspace();
  const positioned = recordCreationPosition(workspace, { mode: "screenplay", view: "unit", unitId: "episode-1", unitUpdatedAt: "2026-07-31T01:00:00.000Z" });
  assert.equal(positioned.settings.lastMode, "screenplay");
  assert.equal(positioned.settings.lastView, "unit");
  assert.equal(positioned.settings.lastUnitId, "episode-1");
  const normalized = normalizeCreationWorkspace(positioned);
  assert.equal(normalized.settings.lastUnitId, "episode-1");
});

test("unfinalizing a foundation document cascades without deleting content", () => {
  const base = createCreationWorkspace();
  const workspace = {
    ...base,
    documents: {
      backgroundWorld: { content: "world", status: "finalized", updatedAt: "world" },
      characterBible: { content: "characters", status: "finalized", updatedAt: "characters" },
      plotOutline: { content: "outline", status: "finalized", updatedAt: "outline" },
    },
    novel: { arcs: [], units: [{ ...base.novel.units[0], content: "chapter", status: "finalized" }] },
  };
  const updated = unfinalizeDocument(workspace, "backgroundWorld");
  assert.equal(updated.documents.backgroundWorld.content, "world");
  assert.equal(updated.documents.backgroundWorld.status, "draft");
  assert.equal(updated.documents.characterBible.status, "draft");
  assert.equal(updated.documents.plotOutline.status, "draft");
  assert.equal(updated.novel.units[0].content, "chapter");
  assert.equal(updated.novel.units[0].status, "draft");
});

test("unfinalizing an episode plan and unit preserves downstream content", () => {
  const base = createCreationWorkspace();
  const unit = { ...base.screenplay.units[0], id: "episode-1", content: "episode", status: "finalized" };
  const workspace = {
    ...base,
    screenplay: {
      arcs: [],
      units: [unit],
      episodePlan: { totalEpisodes: 1, items: [], status: "finalized", updatedAt: "plan" },
    },
  };
  const planDraft = unfinalizeEpisodePlan(workspace, "screenplay");
  assert.equal(planDraft.screenplay.episodePlan.status, "draft");
  assert.equal(planDraft.screenplay.units[0].content, "episode");
  assert.equal(planDraft.screenplay.units[0].status, "draft");
  const unitFinal = { ...planDraft, screenplay: { ...planDraft.screenplay, units: [{ ...unit, status: "finalized" }] } };
  const unitDraft = unfinalizeUnit(unitFinal, "screenplay", "episode-1");
  assert.equal(unitDraft.screenplay.units[0].content, "episode");
  assert.equal(unitDraft.screenplay.units[0].status, "draft");
});

test("finalizing a non-empty unit makes it eligible for unfinalize-and-edit", () => {
  const base = createCreationWorkspace();
  const workspace = { ...base, novel: { arcs: [], units: [{ ...base.novel.units[0], id: "chapter-1", content: "正文内容" }] } };
  const finalized = finalizeUnit(workspace, "novel", "chapter-1");
  assert.equal(finalized.novel.units[0].status, "finalized");
  assert.equal(finalized.novel.units[0].content, "正文内容");
});
