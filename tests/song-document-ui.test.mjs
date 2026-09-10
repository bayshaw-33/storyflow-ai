import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const card = readFileSync("components/song-workbench/SongDocumentCard.tsx", "utf8");
const preview = readFileSync("components/song-workbench/SongDocumentPreview.tsx", "utf8");
const documents = readFileSync("lib/song/documents.ts", "utf8");

test("song outputs are document cards in chat", () => {
  assert.match(page, /SongDocumentCard/);
  assert.match(card, /v6_style/);
  assert.match(card, /sfx_description/);
});

test("document preview supports edit, copy, translation and byte enforcement", () => {
  assert.match(preview, /一键翻译|Translate/);
  assert.match(preview, /保存当前文档|Save document/);
  assert.match(preview, /V6_STYLE_MAX_BYTES/);
  assert.match(documents, /TextEncoder/);
  assert.match(documents, /V6_STYLE_MAX_BYTES = 1000/);
});

test("AI document versions can be appended and manual saves replace the current card", () => {
  assert.match(documents, /createSongDocument/);
  assert.match(documents, /replaceSongDocument/);
  assert.match(page, /setDocuments\(\(current\) =>/);
});
