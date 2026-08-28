// Scoped recovery for the two stored Coze TTS results and five failed test jobs.
// Default is read-only. --apply repairs job links and archives failures without
// deleting records/assets or submitting another paid provider request.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apply = process.argv.includes("--apply");
const projectRef = "vgcafbzksizlwmylphzu";
const ownerId = "1a69e643-ad95-4721-9f00-a83b7e7b2f3e";
const recoverIds = ["9e912983-1a03-437c-b2ab-18911fb05dba", "0454e757-1853-4fd4-ad33-c5f43f936c68"];
const archiveIds = [
  "5c7201e1-0030-43aa-86a9-3bc65c683701", "ecdc7552-755c-4783-b3d8-cc1d1a6e4669",
  "a254738d-712f-44d9-b61c-8b09144d3cc5", "b4fad011-fa28-4cca-8b1d-7bd85a557868",
  "14640c00-4329-4d3d-84e3-97dc886a24cd", "58cea2af-a9a5-4592-ac2b-4230ab6ee54a",
  "8db36673-c8ae-43be-b2da-921b65f9ffbe", "5a2bdda2-1c72-4a10-b75e-035222d1b6f5",
  "5d881f20-f42c-4b5f-890f-1089d02c1c4e", "de61aa7d-c4d5-41ae-a0b9-d13d73909974",
  "ea166487-413e-4600-82ce-7286b1679faa", "3e850ae7-049b-46c3-9277-b128d4a8add2",
  "d3c30743-e134-457a-8e08-fd9cec24fc24", "01fa497b-c09b-448e-9917-d9cd06553bb1",
  "56dbe518-9670-42c4-a45b-96e118cfd069",
];
execFileSync(process.execPath, ["scripts/verify-supabase-target.mjs", "production"], { stdio: "inherit" });
const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", projectRef, "--output", "json"], { encoding: "utf8", timeout: 30000 }));
const key = keys.find((entry) => entry.name === "service_role")?.api_key;
if (!key) throw new Error("Production service key unavailable");
const base = `https://${projectRef}.supabase.co`;
async function request(path, init = {}) {
  const response = await fetch(base + path, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Recovery request failed: HTTP ${response.status}`);
  return response;
}
const json = async (path, init) => (await request(path, init)).json();
const table = "/rest/v1/storyflow_generation_jobs";
for (const id of [...recoverIds, ...archiveIds]) {
  const filter = `id=eq.${id}&owner_id=eq.${ownerId}&job_type=eq.audio`;
  const [job] = await json(`${table}?${filter}&limit=1`);
  if (!job) throw new Error(`Scoped job not found: ${id}`);
  if (recoverIds.includes(id)) {
    if (job.status === "completed") { console.log({ id, action: "already recovered" }); continue; }
    if (job.status !== "result_ingesting") throw new Error(`Job state changed: ${id}`);
    const path = `${ownerId}/${id}.mp3`;
    const [asset] = await json(`/rest/v1/storyflow_assets?user_id=eq.${ownerId}&storage_path=eq.${encodeURIComponent(path)}&select=id,created_at&order=created_at.asc&limit=1`);
    if (!asset) throw new Error(`Stored audio has no existing asset: ${id}`);
    const audio = await request(`/storage/v1/object/authenticated/audio-assets/${path}`);
    const bytes = Buffer.from(await audio.arrayBuffer());
    const directory = mkdtempSync(join(tmpdir(), "kiikis-audio-recovery-"));
    const file = join(directory, `${id}.mp3`);
    let info;
    try {
      writeFileSync(file, bytes, { mode: 0o600 });
      info = execFileSync("/usr/bin/afinfo", [file], { encoding: "utf8", timeout: 15000 });
    } finally {
      unlinkSync(file);
      rmdirSync(directory);
    }
    const duration = Number(/estimated duration:\s*([\d.]+)/.exec(info)?.[1]);
    if (!Number.isFinite(duration) || duration <= 0 || !bytes.length) throw new Error(`Audio validation failed: ${id}`);
    if (apply) {
      const signed = await json(`/storage/v1/object/sign/audio-assets/${path}`, { method: "POST", body: JSON.stringify({ expiresIn: 604800 }) });
      if (!signed.signedURL?.startsWith("/object/sign/audio-assets/")) throw new Error("Unexpected signed audio path");
      const updated = await json(`${table}?${filter}&status=eq.result_ingesting`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "completed", error: null, storage_path: path, result_url: base + "/storage/v1" + signed.signedURL, completed_at: asset.created_at,
          result_metadata: { ...job.result_metadata, assetId: asset.id, recoveredAt: new Date().toISOString(), recoveredFromStatus: job.status, recoveredAudioBytes: bytes.length, recoveredAudioDurationSeconds: duration } }),
      });
      if (updated.length !== 1) throw new Error(`Concurrent recovery detected: ${id}`);
    }
    console.log({ id, action: apply ? "recovered" : "would recover", bytes: bytes.length, durationSeconds: duration });
  } else {
    if (job.result_metadata?.archivedAt) { console.log({ id, action: "already archived" }); continue; }
    if (!["failed", "provider_timeout", "queued", "generating"].includes(job.status) || job.result_url || job.storage_path) throw new Error(`Failure archive precondition changed: ${id}`);
    if (apply) {
      const updated = await json(`${table}?${filter}&status=eq.${job.status}`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ completed_at: job.completed_at || job.updated_at || job.created_at,
          result_metadata: { ...job.result_metadata, archivedAt: new Date().toISOString(), archiveReason: ["queued", "generating"].includes(job.status) ? "coze-verification-stale-test-audio" : "coze-verification-failed-test-audio", originalStatus: job.status } }),
      });
      if (updated.length !== 1) throw new Error(`Concurrent archive detected: ${id}`);
    }
    console.log({ id, action: apply ? "archived (recoverable)" : "would archive", originalStatus: job.status });
  }
}
