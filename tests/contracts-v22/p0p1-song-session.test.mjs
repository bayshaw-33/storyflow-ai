/**
 * P1-05 — 歌曲会话恢复（真实消息序列，notes 降级为派生摘要）。
 *
 * 撰写时 RED：applySongProject 把全部历史压成一条 assistant 消息；
 * SongSessionLedger（Phase 5 Task 5.2）写好但从未接线。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("song reopen restores the real message order from the conversation ledger", () => {
  const page = read("../../app/song-workbench/page.tsx");
  assert.match(page, /conversations\/.*\/messages|\/messages\?/, "reopen pulls real messages");
  assert.match(page, /song-legacy-import:/, "legacy notes import exactly once via a deterministic idempotency key");
  assert.match(page, /【legacy_import】/, "imported notes are marked as legacy");
});

test("song sends append user + assistant messages to the ledger", () => {
  const page = read("../../app/song-workbench/page.tsx");
  const sendIdx = page.indexOf("function sendChatMessage");
  assert.ok(sendIdx > 0, "sendChatMessage exists");
  assert.match(page, /appendSongLedgerMessage|appendLedger/, "ledger append helper exists");
});

test("songDevelopmentNotes stay only a derived prompt cache, never the restore source", () => {
  const page = read("../../app/song-workbench/page.tsx");
  const applyIdx = page.indexOf("function applySongProject");
  const applyBlock = page.slice(applyIdx, applyIdx + 1600);
  // 重开路径不再把 notes 压成单条 assistant 消息；真实历史来自 ledger
  assert.doesNotMatch(applyBlock, /createSongAssistantMessage\(snapshot\.songDevelopmentNotes\)/, "the notes blob must not be replayed as one assistant message");
  assert.match(applyBlock, /restoreSongLedger\(/, "reopen triggers the ledger restore");
});

test("resolve-work provisions a song-type work for song projects", () => {
  const route = read("../../app/api/v2/project-start/resolve-work/route.ts");
  assert.match(route, /workflow_type[^;]*song.*"song"|p_work_type[^;]*song/, "song projects get a song work, not a script work");
});
