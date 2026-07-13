import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";

import {
  assembleNovel,
  assembleScreenplay,
  buildDeliveryManifest,
} from "../lib/creation/assembly.ts";
import { buildDeliveryZipBytes, buildDocxBytes } from "../lib/creation/downloads.ts";
import { createCreationWorkspace, normalizeCreationWorkspace } from "../lib/creation/state.ts";

function unit(id, number, title, content, translation = "") {
  return {
    id, number, title, outline: "", content, screenplay: null, continuityNotes: "", status: "reviewed",
    versions: [], translation, localizedContent: "", localizationChanges: "", similarityReport: "",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("assembles novel units by arc order and removes duplicate generated headings", () => {
  const base = createCreationWorkspace();
  const workspace = normalizeCreationWorkspace({
    ...base,
    novel: {
      arcs: [
        { id: "arc-2", number: 2, title: "Second Arc", outline: "", unitIds: ["chapter-2"] },
        { id: "arc-1", number: 1, title: "First Arc", outline: "", unitIds: ["chapter-1"] },
      ],
      units: [
        unit("chapter-2", 2, "Second", "# Chapter 2 Second\n\nSecond body"),
        unit("chapter-1", 1, "First", "# Chapter 1 First\n\nFirst body"),
      ],
    },
  });

  const assembled = assembleNovel(workspace, "original", "My Story");
  assert.ok(assembled.markdown.indexOf("First Arc") < assembled.markdown.indexOf("Second Arc"));
  assert.ok(assembled.markdown.indexOf("First body") < assembled.markdown.indexOf("Second body"));
  assert.equal((assembled.markdown.match(/^## Chapter 1 First$/gm) || []).length, 1);
  assert.deepEqual(assembled.diagnostics, []);
});

test("reports missing, duplicate, and draft units", () => {
  const base = createCreationWorkspace();
  const workspace = normalizeCreationWorkspace({
    ...base,
    novel: {
      arcs: [{ id: "arc-1", number: 1, title: "Arc", outline: "", unitIds: ["chapter-1", "missing"] }],
      units: [
        { ...unit("chapter-1", 1, "Same", "Body"), status: "draft" },
        unit("chapter-2", 2, "Same", "Other"),
      ],
    },
  });

  const codes = assembleNovel(workspace, "original", "My Story").diagnostics.map((item) => item.code);
  assert.ok(codes.includes("missing_unit"));
  assert.ok(codes.includes("draft_unit"));
  assert.ok(codes.includes("duplicate_title"));
});

test("pairs original and translated novel paragraphs", () => {
  const base = createCreationWorkspace();
  const workspace = normalizeCreationWorkspace({
    ...base,
    novel: {
      arcs: [],
      units: [unit("chapter-1", 1, "One", "First paragraph.\n\nSecond paragraph.", "第一段。\n\n第二段。")],
    },
  });

  const markdown = assembleNovel(workspace, "bilingual", "My Story").markdown;
  assert.match(markdown, /First paragraph\.\n\n> 第一段。/);
  assert.match(markdown, /Second paragraph\.\n\n> 第二段。/);
});

test("re-renders and renumbers structured screenplay episodes", () => {
  const base = createCreationWorkspace();
  const scriptUnit = unit("episode-1", 1, "Pilot", "");
  scriptUnit.screenplay = {
    id: "ep-1", episodeNo: 9, title: "Pilot", logline: "Start", scenes: [{
      id: "scene-1", sceneNo: 7, interiorExterior: "INT", location: "ROOM", timeOfDay: "NIGHT",
      characters: ["Ana"], blocks: [{ id: "b1", type: "dialogue", character: "Ana", text: "Hola.", translation: "你好。" }],
    }],
  };
  const workspace = normalizeCreationWorkspace({ ...base, screenplay: { arcs: [], units: [scriptUnit] } });

  const markdown = assembleScreenplay(workspace, "original", "international_production", "My Script").markdown;
  assert.match(markdown, /# EP01｜Pilot/);
  assert.match(markdown, /## 1-1 INT\. ROOM - NIGHT/);
});

test("uses dynamic language filenames and omits empty translation documents", () => {
  const base = createCreationWorkspace();
  const workspace = normalizeCreationWorkspace({
    ...base,
    novel: { arcs: [], units: [unit("chapter-1", 1, "One", "Body")] },
    settings: { ...base.settings, activeMode: "novel", sourceLanguage: "English", translationLanguage: "Chinese", translationEnabled: true },
  });
  const withoutTranslation = buildDeliveryManifest({ title: "My Story" }, workspace);
  assert.ok(withoutTranslation.some((item) => item.baseFilename.includes("english")));
  assert.ok(!withoutTranslation.some((item) => item.id === "manuscript-translation"));

  workspace.novel.units[0].translation = "译文";
  const withTranslation = buildDeliveryManifest({ title: "My Story" }, workspace);
  assert.ok(withTranslation.some((item) => item.baseFilename.includes("chinese")));
});

test("builds real DOCX and ZIP delivery bytes", async () => {
  const document = { title: "Test", language: "English", markdown: "# Test\n\nBody", diagnostics: [] };
  const docx = await buildDocxBytes(document);
  assert.equal(String.fromCharCode(docx[0], docx[1]), "PK");

  const zipBytes = await buildDeliveryZipBytes([{ id: "test", label: "Test", baseFilename: "test", document }]);
  const zip = await JSZip.loadAsync(zipBytes);
  assert.ok(zip.file("test.md"));
  assert.ok(zip.file("test.docx"));
  assert.ok(zip.file("manifest.json"));
});
