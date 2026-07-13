import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBatchGeneration,
  applyUnitGeneration,
  parseArcStructure,
  parseBatchUnitOutput,
} from "../lib/creation/parsers.ts";
import { createCreationWorkspace, normalizeCreationWorkspace } from "../lib/creation/state.ts";

function unitPayload(number, title, content) {
  return { number, title, outline: `Outline ${number}`, content };
}

function marked(value) {
  return `<CREATION_OUTPUT>\n${JSON.stringify(value)}\n</CREATION_OUTPUT>`;
}

test("parses variable child counts across twelve major arcs", () => {
  const markdown = Array.from({ length: 12 }, (_, arcIndex) => {
    const children = Array.from({ length: arcIndex % 2 === 0 ? 1 : 2 }, (_, childIndex) =>
      `### 第 ${childIndex + 1} 章｜Chapter ${arcIndex + 1}.${childIndex + 1}`,
    ).join("\n");
    return `## 大章 ${arcIndex + 1}｜Arc ${arcIndex + 1}\nArc outline\n${children}`;
  }).join("\n\n");

  const arcs = parseArcStructure(markdown, "novel");
  assert.equal(arcs.length, 12);
  assert.equal(arcs[0].unitIds.length, 1);
  assert.equal(arcs[1].unitIds.length, 2);
  assert.equal(arcs[11].number, 12);
});

test("splits one major-arc response into independent units", () => {
  const units = parseBatchUnitOutput(marked([
    unitPayload(1, "One", "First"),
    unitPayload(2, "Two", "Second"),
    unitPayload(3, "Three", "Third"),
  ]), "novel");

  assert.deepEqual(units.map((unit) => unit.content), ["First", "Second", "Third"]);
});

test("rejects malformed output without mutating current content", () => {
  const workspace = normalizeCreationWorkspace({
    ...createCreationWorkspace(),
    novel: {
      arcs: [],
      units: [{
        id: "chapter-1", number: 1, title: "One", outline: "", content: "Original", screenplay: null,
        continuityNotes: "", status: "draft", versions: [], translation: "", localizedContent: "",
        localizationChanges: "", similarityReport: "", createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    },
  });

  assert.throws(
    () => applyUnitGeneration(workspace, "novel", "chapter-1", "not marked json", { model: "test", instruction: "revise", scope: "unit" }),
    /malformed/i,
  );
  assert.equal(workspace.novel.units[0].content, "Original");
  assert.deepEqual(workspace.novel.units[0].versions, []);
});

test("saves the previous version and rejects locked units", () => {
  const base = normalizeCreationWorkspace({
    ...createCreationWorkspace(),
    novel: {
      arcs: [],
      units: [{
        id: "chapter-1", number: 1, title: "One", outline: "", content: "Original", screenplay: null,
        continuityNotes: "", status: "draft", versions: [], translation: "", localizedContent: "",
        localizationChanges: "", similarityReport: "", createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    },
  });
  const updated = applyUnitGeneration(base, "novel", "chapter-1", marked(unitPayload(1, "One", "Revision")), {
    model: "deepseek",
    instruction: "raise tension",
    scope: "unit",
  });

  assert.equal(updated.novel.units[0].content, "Revision");
  assert.equal(updated.novel.units[0].versions[0].content, "Original");
  assert.equal(updated.novel.units[0].versions[0].instruction, "raise tension");

  const locked = {
    ...updated,
    novel: { ...updated.novel, units: updated.novel.units.map((unit) => ({ ...unit, status: "locked" })) },
  };
  assert.throws(
    () => applyUnitGeneration(locked, "novel", "chapter-1", marked(unitPayload(1, "One", "Overwrite")), {
      model: "deepseek", instruction: "overwrite", scope: "unit",
    }),
    /locked/i,
  );
});

test("keeps successful batch units when another unit fails", () => {
  const workspace = normalizeCreationWorkspace({
    ...createCreationWorkspace(),
    novel: {
      arcs: [],
      units: [1, 2].map((number) => ({
        id: `chapter-${number}`, number, title: `${number}`, outline: "", content: `Old ${number}`, screenplay: null,
        continuityNotes: "", status: number === 2 ? "locked" : "draft", versions: [], translation: "",
        localizedContent: "", localizationChanges: "", similarityReport: "", createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    },
  });

  const result = applyBatchGeneration(workspace, "novel", [
    { unitId: "chapter-1", output: marked(unitPayload(1, "One", "New 1")) },
    { unitId: "chapter-2", output: marked(unitPayload(2, "Two", "New 2")) },
  ], { model: "deepseek", instruction: "generate arc", scope: "arc" });

  assert.equal(result.workspace.novel.units[0].content, "New 1");
  assert.equal(result.workspace.novel.units[1].content, "Old 2");
  assert.deepEqual(result.failures.map((failure) => failure.unitId), ["chapter-2"]);
});
