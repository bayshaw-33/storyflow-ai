import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const component = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("audio candidates do not consume the original song result split", () => {
  assert.match(page, /song-audio-dock/);
  const lowerStart = page.indexOf('<div className="song-right-lower">');
  const dockStart = page.indexOf('<div className="song-audio-dock">');
  const audioComponent = page.indexOf("<AudioCandidates");
  assert.ok(lowerStart >= 0 && dockStart > lowerStart && audioComponent > dockStart);
  assert.match(css, /\.song-audio-dock\s*\{[\s\S]*position:\s*absolute/);
});

test("audio candidates can collapse while keeping generation available", () => {
  assert.match(component, /song-audio-card/);
  assert.match(component, /aria-expanded/);
  assert.match(component, /setOpen|setExpanded/);
});
