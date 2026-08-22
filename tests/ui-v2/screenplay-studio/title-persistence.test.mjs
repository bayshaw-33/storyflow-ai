/**
 * P0-04 — 标题与正文一起保存（Screenplay Studio 保存流）。
 *
 * 撰写时 RED：handleTitleChange 只改本地 state，saveActiveUnit 只 POST
 * 正文，保存后的 getUnit 刷新把用户刚改的标题回滚成服务器旧标题。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url),
  "utf8",
);

test("title edits mark the workbench unsaved", () => {
  const handleTitleChange = extractFunction(source, "handleTitleChange");
  assert.match(handleTitleChange, /onUnsavedChange\?\.\(true\)/, "editing a title must set the unsaved flag");
});

test("save persists a dirty title before the content body", () => {
  const saveActiveUnit = extractFunction(source, "saveActiveUnit");
  const titleIdx = saveActiveUnit.indexOf("updateUnitIdentity");
  const contentIdx = saveActiveUnit.indexOf("saveUnitContent");
  assert.ok(titleIdx !== -1, "save flow must PATCH unit identity when the title is dirty");
  assert.ok(contentIdx !== -1, "save flow must POST unit content");
  assert.ok(titleIdx < contentIdx, "identity PATCH runs first — a later content failure keeps the unsaved state honest");
});

test("save only refreshes from the server after both title and content succeed", () => {
  const saveActiveUnit = extractFunction(source, "saveActiveUnit");
  const refreshIdx = saveActiveUnit.indexOf("getUnit");
  const contentIdx = saveActiveUnit.indexOf("saveUnitContent");
  assert.ok(refreshIdx > contentIdx, "getUnit refresh must come after saveUnitContent, never clobbering a dirty title");
});

test("a failed save keeps the local title and body (no state reset in the catch path)", () => {
  const saveActiveUnit = extractFunction(source, "saveActiveUnit");
  const catchIdx = saveActiveUnit.indexOf("} catch");
  const tail = saveActiveUnit.slice(catchIdx);
  assert.doesNotMatch(tail, /setActiveContent\(""\)|setUnits\(\(prev\) => prev\.map\(\(u\) => \(u\.id === activeUnit\.id \? unit : u\)\)\)/, "the catch path must not overwrite local edits with server state");
});

/** Extract a `const NAME = useCallback(async (...) => { ... }, [...])` block. */
function extractFunction(src, name) {
  const start = src.indexOf(`const ${name} = useCallback(`);
  assert.ok(start !== -1, `${name} not found`);
  let depth = 0;
  let i = src.indexOf("(", start);
  for (; i < src.length; i += 1) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  // walk past the dependency array to the closing of useCallback(...)
  const depsStart = src.indexOf(", [", i);
  const end = src.indexOf("])", depsStart) + 2;
  return src.slice(start, end);
}
