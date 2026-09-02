import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/song-workbench/page.tsx", import.meta.url);

test("歌曲对话网络中断时保留输入并翻译裸 Load failed", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(
    source,
    /setChatInput\(trimmed\);[\s\S]{0,500}setError\(toSongChatError\(chatError, isZh\)\);/,
    "对话网络失败必须恢复草稿，并走友好错误映射",
  );
  assert.match(
    source, /function toSongChatError\(error: unknown, isZh: boolean\)/,
    "页面必须把浏览器的 Load failed 转成可执行提示",
  );
});
