import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
export const MP3_EXPORT_BITRATE = 320000;

/** Read an MPEG-1 Layer III frame header, skipping any ID3v2 tag. */
export function readMp3Encoding(bytes: Uint8Array): { bitrate: number; sampleRate: number; channels: number } | null {
  let start = 0;
  if (bytes.length >= 10 && String.fromCharCode(...bytes.slice(0, 3)) === "ID3") {
    start = 10 + ((bytes[6] & 127) << 21 | (bytes[7] & 127) << 14 | (bytes[8] & 127) << 7 | bytes[9] & 127);
  }
  const bitrates = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
  for (let i = start; i + 4 < Math.min(bytes.length, start + 4096); i++) {
    if (bytes[i] !== 255 || (bytes[i+1] & 254) !== 250) continue;
    const bitrate = bitrates[bytes[i+2] >> 4];
    const sampleRate = [44100,48000,32000][(bytes[i+2] >> 2) & 3];
    if (!bitrate || !sampleRate) continue;
    const frameSize = Math.floor(144000 * bitrate / sampleRate) + ((bytes[i+2] >> 1) & 1);
    const next = i + frameSize;
    if (next + 1 >= bytes.length || bytes[next] !== 255 || (bytes[next+1] & 254) !== 250) continue;
    return { bitrate: bitrate * 1000, sampleRate, channels: bytes[i+3] >> 6 === 3 ? 1 : 2 };
  }
  return null;
}

export async function encodeMp3ForDownload(source: Uint8Array): Promise<Uint8Array> {
  if (!ffmpegPath) throw new Error("MP3_ENCODER_UNAVAILABLE");
  if (!source.length || source.length > 150 * 1024 * 1024) throw new Error("AUDIO_EXPORT_SIZE_INVALID");
  const directory = await mkdtemp(join(tmpdir(), "kiikis-mp3-"));
  try {
    const input = join(directory, "source");
    const output = join(directory, "download.mp3");
    await writeFile(input, source);
    await run(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-i", input,
      "-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-b:a", "320k", "-ar", "44100", "-ac", "2", "-id3v2_version", "3", output],
      { timeout: 100000, maxBuffer: 1024 * 1024 });
    const bytes = await readFile(output);
    const encoding = readMp3Encoding(bytes);
    if (encoding?.bitrate !== MP3_EXPORT_BITRATE || encoding.sampleRate !== 44100 || encoding.channels !== 2) throw new Error("MP3_EXPORT_VERIFICATION_FAILED");
    return bytes;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
