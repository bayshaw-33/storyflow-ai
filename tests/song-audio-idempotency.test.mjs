import assert from "node:assert/strict";
import test from "node:test";
import { computeAudioIdempotencyHash } from "../lib/audio/jobs.ts";

test("changing vocal gender or lyrics never reuses a previous music job", () => {
  const input = { ownerId: "owner", kind: "music", targetId: "song", text: "piano", provider: "atlascloud", model: "suno/chirp-v6-mini", musicMode: "vocal", lyrics: "第一稿", voiceGender: "male" };
  const original = computeAudioIdempotencyHash(input);
  assert.equal(computeAudioIdempotencyHash({ ...input }), original);
  assert.notEqual(computeAudioIdempotencyHash({ ...input, voiceGender: "female" }), original);
  assert.notEqual(computeAudioIdempotencyHash({ ...input, lyrics: "修改后的歌词" }), original);
  assert.equal(computeAudioIdempotencyHash({ ...input, kind: "tts" }), computeAudioIdempotencyHash({ ...input, kind: "tts", lyrics: "不应影响配音", voiceGender: "female" }));
});
