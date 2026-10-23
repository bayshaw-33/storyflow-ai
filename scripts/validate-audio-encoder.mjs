import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ffmpeg from 'ffmpeg-static';

// Some deployment package managers skip dependency lifecycle scripts.
// Prepare only this explicitly approved encoder, then fail the build if it is unusable.
const require = createRequire(import.meta.url);
if (!ffmpeg) throw new Error('The audio encoder does not support this deployment platform.');
if (!existsSync(ffmpeg)) {
  execFileSync(process.execPath, [require.resolve('ffmpeg-static/install.js')], { stdio: 'inherit', timeout: 180000 });
}
const encoders = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 10000 });
if (!encoders.includes('libmp3lame')) throw new Error('The MP3 encoder is unavailable; refusing to publish broken music downloads.');
console.log('Audio export encoder verified.');
