import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const component = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("audio candidates share the lower workspace without overlaying the style prompt", () => {
  const lowerStart = page.indexOf('<div className="song-right-lower">');
  const styleCard = page.indexOf("song-style-card", lowerStart);
  const audioComponent = page.indexOf("<AudioCandidates");
  assert.ok(lowerStart >= 0 && styleCard > lowerStart && audioComponent > styleCard);
  assert.doesNotMatch(page, /song-audio-dock/);
  assert.doesNotMatch(css, /\.song-audio-dock\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /\.song-right-lower\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:/s);
});

test("desktop song workbench uses the available viewport width", () => {
  assert.match(css, /\.song-workbench-page\.song-workbench-v2\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /\.song-workbench-v2 \.song-title-bar\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s);
  assert.match(css, /\.song-shell-v2\s*\{[^}]*width:\s*100%/s);
});

test("audio candidates can collapse while keeping generation available", () => {
  assert.match(component, /song-audio-card/);
  assert.match(component, /aria-expanded/);
  assert.match(component, /setOpen|setExpanded/);
});
