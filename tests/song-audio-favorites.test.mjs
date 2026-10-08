import assert from "node:assert/strict";
import test from "node:test";

test("favorite and unfavorite persist per owned music job without changing cover metadata", async () => {
  const { setMusicJobFavorite } = await import("../lib/audio/favorites.ts");
  const row = { id: "job-1", target_type: "song_version", input_params: { kind: "music", candidate: "A", voiceGender: "female" } };
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (!init) return [row];
    Object.assign(row, JSON.parse(init.body));
    return [row];
  };
  for (const favorite of [true, false]) {
    await setMusicJobFavorite(fetcher, { jobId: "job-1", ownerId: "owner-1", projectId: "project-1", favorite });
    assert.equal(row.input_params.favorite, favorite);
    assert.equal(row.input_params.voiceGender, "female");
    assert.ok(calls.every((call) => /owner_id=eq.owner-1/.test(call.path) && /project_id=eq.project-1/.test(call.path)));
    assert.ok(calls.filter((call) => call.init).every((call) => !call.init.body.includes("result_metadata")));
  }
});

test("favorite never writes when the scoped job is absent or belongs to TTS", async () => {
  const { setMusicJobFavorite } = await import("../lib/audio/favorites.ts");
  for (const rows of [[], [{ target_type: "voice_line", input_params: { kind: "tts" } }]]) {
    let writes = 0;
    await assert.rejects(() => setMusicJobFavorite(async (_path, init) => { if (init) writes++; return rows; }, { jobId: "other-job", ownerId: "owner-1", projectId: "project-1", favorite: true }), /MUSIC_JOB_NOT_FOUND/);
    assert.equal(writes, 0);
  }
});
