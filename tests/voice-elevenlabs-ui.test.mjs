import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const editor = readFileSync("components/v2/voice-workbench/VoiceLineEditor.tsx", "utf8");
const workbench = readFileSync("components/v2/voice-workbench/VoiceWorkbench.tsx", "utf8");

test("voice workbench exposes an ElevenLabs voice selector and source tabs", () => {
  assert.match(editor, /elevenlabs-voice-selector/);
  assert.match(editor, /我的音色/);
  assert.match(editor, /ElevenLabs 音色库/);
  assert.match(editor, /previewUrl/);
  assert.match(editor, /source, pageSize/);
  assert.match(editor, /创建克隆音色/);
  assert.match(editor, /type="file"/);
});

test("the selected ElevenLabs voice is sent as voiceProviderVoiceId", () => {
  assert.match(editor, /voiceProviderVoiceId/);
  assert.match(editor, /voiceRef/);
  assert.match(workbench, /providerName/);
});

test("the editor renders a reliable audio preview and download action", () => {
  assert.match(editor, /audioUrl/);
  assert.match(editor, /audio/);
  assert.match(editor, /download/);
});
