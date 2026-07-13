import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreationWorkspace,
  normalizeCreationWorkspace,
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
  assert.equal(project.creationWorkspace?.novel.units[0].status, "reviewed");
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

test("does not overwrite a locked unit", () => {
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
        status: "locked",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  assert.throws(
    () => updateCreationUnit(workspace, "novel", "locked-chapter", { content: "Accidental overwrite" }),
    /locked/i,
  );
  assert.equal(workspace.novel.units[0].content, "Approved text");
});
