import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const editor = readFileSync("components/v2/voice-workbench/VoiceLineEditor.tsx", "utf8");

test("ElevenLabs voice directory, clone, and generation requests carry the Supabase session", () => {
  assert.match(editor, /getSupabaseBrowserClient/);
  assert.match(editor, /auth\.getSession\(\)/);
  assert.match(editor, /fetch\(`\/api\/voice\/elevenlabs\/voices\?[\s\S]{0,700}headers: await getAuthHeaders\(\)/);
  assert.match(editor, /fetch\("\/api\/voice\/elevenlabs\/clone"[\s\S]{0,500}headers: await getAuthHeaders\(\)/);
  assert.match(editor, /headers: \{ "Content-Type": "application\/json", \.\.\.\(await getAuthHeaders\(\)\) \}/);
});
