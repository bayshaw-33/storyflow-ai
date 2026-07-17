import assert from "node:assert/strict";
import test from "node:test";

const { byteLength, trimPromptBytes } = await import("../lib/song/prompt.ts");

test("keeps a 999-byte Suno style prompt unchanged", () => {
  const prompt = "a".repeat(999);

  assert.equal(trimPromptBytes(prompt, 1000), prompt);
  assert.equal(byteLength(prompt), 999);
});

test("keeps a 1000-byte Suno style prompt unchanged", () => {
  const prompt = "a".repeat(1000);

  assert.equal(trimPromptBytes(prompt, 1000), prompt);
  assert.equal(byteLength(prompt), 1000);
});

test("trims a 1001-byte Suno style prompt to 1000 bytes", () => {
  const prompt = "a".repeat(1001);
  const trimmed = trimPromptBytes(prompt, 1000);

  assert.equal(trimmed, "a".repeat(1000));
  assert.equal(byteLength(trimmed), 1000);
});

test("never splits a multibyte character at the byte boundary", () => {
  const trimmed = trimPromptBytes(`${"a".repeat(997)}🎵`, 1000);

  assert.equal(trimmed, "a".repeat(997));
  assert.equal(byteLength(trimmed), 997);
  assert.doesNotMatch(trimmed, /�/);
});
