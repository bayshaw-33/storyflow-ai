import assert from "node:assert/strict";
import test from "node:test";

test("first generation honors an explicit Chinese lyric request over the English default", async () => {
  const { prepareSongGeneration } = await import("../lib/song/generation-request.ts");
  const result = prepareSongGeneration({ outputLanguage: "English", concept: "" }, "", [], "写一首中文歌词的歌，副歌要克制");
  assert.equal(result.form.outputLanguage, "Chinese");
  assert.match(result.notes, /中文歌词/);
  assert.equal(result.instruction, "写一首中文歌词的歌，副歌要克制");
  assert.ok(result.form.concept);
});

test("latest user language wins; assistant suggestions and reference language do not change it", async () => {
  const { prepareSongGeneration } = await import("../lib/song/generation-request.ts");
  const form = { outputLanguage: "English", concept: "城市夜景" };
  const messages = [{ role: "user", content: "我要中文歌词" }, { role: "assistant", content: "可以参考英文歌词" }];
  assert.equal(prepareSongGeneration(form, "", messages, "副歌更短").form.outputLanguage, "Chinese");
  assert.equal(prepareSongGeneration(form, "", messages, "改成西班牙语歌词").form.outputLanguage, "Spanish");
  assert.equal(prepareSongGeneration(form, "", [], "参考一首中文歌曲的编曲").form.outputLanguage, "English");
  assert.equal(prepareSongGeneration(form, "", [], "不要英文歌词，用中文").form.outputLanguage, "Chinese");
  assert.equal(prepareSongGeneration(form, "", [], "中英双语歌词").form.outputLanguage, "Bilingual");
});

test("pending revision is present immediately without waiting for a React state update", async () => {
  const { prepareSongGeneration } = await import("../lib/song/generation-request.ts");
  const result = prepareSongGeneration({ outputLanguage: "Chinese", concept: "原设定" }, "USER:\n旧要求", [], "删掉第一段，副歌改成四句");
  assert.match(result.notes, /旧要求[\s\S]*删掉第一段，副歌改成四句/);
  assert.equal(result.instruction, "删掉第一段，副歌改成四句");
  assert.equal(result.form.concept, "原设定");
});
