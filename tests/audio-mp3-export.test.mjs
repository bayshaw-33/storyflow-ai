import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { encodeMp3ForDownload, readMp3Encoding } from '../lib/audio/mp3-export.ts';
import { audioArtifactContentType, buildAudioStoragePath } from '../lib/audio/storage.ts';

test('native WAV data keeps the correct original format despite a generic provider MIME type',()=>{
  const bytes=new TextEncoder().encode('RIFF1234WAVE');
  const type=audioArtifactContentType(bytes,'application/octet-stream');
  assert.equal(type,'audio/wav');assert.match(buildAudioStoragePath('owner','job',type),/\.wav$/);
  assert.equal(audioArtifactContentType(new Uint8Array([1,2,3]),'audio/mpeg; charset=binary'),'audio/mpeg');
});

test('actual 192 kbps source exports verified 320 kbps stereo MP3, preserving the source', async () => {
  const directory=await mkdtemp(join(tmpdir(),'kiikis-export-test-'));
  try {
    const path=join(directory,'source.mp3');
    await promisify(execFile)(ffmpeg,['-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','libmp3lame','-b:a','192k',path]);
    const source=await readFile(path);
    assert.equal(readMp3Encoding(source).bitrate,192000);
    const exported=await encodeMp3ForDownload(source);
    assert.deepEqual(readMp3Encoding(exported),{bitrate:320000,sampleRate:44100,channels:2});
    assert.deepEqual(await readFile(path),source);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('invalid source fails instead of emitting a fake 320 kbps file', async () => {
  await assert.rejects(encodeMp3ForDownload(new TextEncoder().encode('not audio')));
  assert.equal(readMp3Encoding(new Uint8Array([1,2,3])),null);
});
