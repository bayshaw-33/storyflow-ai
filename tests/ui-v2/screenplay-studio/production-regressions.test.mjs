import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');

test('embedded screenplay fills its bounded parent rather than growing with history', () => {
  const css = read('components/v2/screenplay-studio/ScreenplayStudio.module.css');
  const embedded = css.match(/\.studio\.embedded\s*\{([^}]+)\}/)[1];
  assert.match(embedded, /height:\s*100%/);
  assert.match(embedded, /min-height:\s*0/);
  assert.match(read('components/production/ProductionWorkbench.module.css'), /\.scriptShell\s*\{[^}]*height:\s*100dvh/);
});

test('script header commands are owned by the screenplay instead of storyboard sourceUnitId', () => {
  const shell = read('components/production/ProductionWorkbench.tsx');
  assert.match(shell, /onActionsChange=\{setScriptActions\}/);
  assert.match(shell, /scriptActions\?\.save/);
  assert.match(shell, /scriptActions\?\.delivery/);
});

test('confirmation saves dirty text before finalizing and downloads do not spawn a blocked popup', () => {
  const studio = read('components/v2/screenplay-studio/ScreenplayStudio.tsx');
  assert.match(studio, /isActiveDirty\s*\?\s*await saveActiveUnit\(\)/);
  assert.match(studio, /currentVersionId:\s*saved\.version\.id/);
  assert.doesNotMatch(studio, /window\.open/);
});

test('applying a candidate protects unsaved text in its target unit', () => {
  const studio = read('components/v2/screenplay-studio/ScreenplayStudio.tsx');
  const room = read('components/v2/screenplay-studio/KkScreenplayRoom.tsx');
  assert.match(studio, /beforeApply=\{async \(targetUnitId\)/);
  assert.match(studio, /isUnitDirty\(targetUnitId\)/);
  assert.match(room, /beforeApply\?\.\(pendingCandidate\.unitId\)/);
});

test('global unsaved warning reflects every loaded unit instead of the last save only', () => {
  const studio = read('components/v2/screenplay-studio/ScreenplayStudio.tsx');
  assert.match(studio, /const hasAnyUnsaved = useMemo/);
  assert.match(studio, /onUnsavedChange\?\.\(hasAnyUnsaved\)/);
  assert.doesNotMatch(studio, /onUnsavedChange\?\.\(false\)/);
});

test('empty screenplay editor remains reachable for typing', () => {
  const editor = read('components/v2/screenplay-studio/ScreenplayEditor.tsx');
  assert.doesNotMatch(editor, /left:\s*-9999/);
});

test('script header wraps controls instead of splitting action labels at small widths', () => {
  const css = read('components/production/ProductionWorkbench.module.css');
  assert.match(css, /\.scriptShell \.unifiedHeaderActions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.scriptShell \.headerActionButton\s*\{[^}]*white-space:\s*nowrap/);
});
