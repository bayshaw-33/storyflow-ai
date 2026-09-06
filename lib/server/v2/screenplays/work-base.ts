import { computeContentHash } from "../works/versions.ts";

type WorkBaseFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

type WorkVersionIdRow = { id: string };

/**
 * Screenplay units have their own immutable versions, while generation
 * snapshots intentionally reference the existing Work-level version chain.
 * Older/newly-created screenplay works can have no Work pointer yet. Create a
 * single durable baseline in the existing table so the generation flow can
 * remain compatible with that schema without a migration.
 */
export async function ensureScreenplayWorkBaseVersion(params: {
  ownerId: string;
  workId: string;
  currentVersionId?: string | null;
  fetcher: WorkBaseFetcher;
}): Promise<string> {
  if (params.currentVersionId) return params.currentVersionId;

  const latest = await params.fetcher<WorkVersionIdRow[]>(
    `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(params.workId)}&select=id&order=created_at.desc&limit=1`,
  );
  if (latest?.[0]?.id) {
    await setCurrentWorkVersion(params, latest[0].id);
    return latest[0].id;
  }

  const idempotencyKey = `screenplay-baseline:${params.workId}`;
  const content = {
    schemaVersion: 1,
    kind: "screenplay-work-baseline",
    workId: params.workId,
  };
  await params.fetcher("/rest/v1/storyflow_work_versions?on_conflict=work_id,idempotency_key", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      work_id: params.workId,
      parent_version_id: null,
      kind: "checkpoint",
      content_schema: "kiikis.screenplay-baseline/1",
      content_json: content,
      content_hash: computeContentHash(content),
      source: "import",
      source_message_ids: [],
      source_job_id: null,
      idempotency_key: idempotencyKey,
      created_by: params.ownerId,
    }),
  });

  const baseline = await params.fetcher<WorkVersionIdRow[]>(
    `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(params.workId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id&limit=1`,
  );
  const baselineId = baseline?.[0]?.id;
  if (!baselineId) throw new Error("Unable to initialize screenplay Work version.");

  await setCurrentWorkVersion(params, baselineId);
  return baselineId;
}

async function setCurrentWorkVersion(
  params: { workId: string; fetcher: WorkBaseFetcher },
  versionId: string,
): Promise<void> {
  await params.fetcher(
    `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(params.workId)}&current_version_id=is.null`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ current_version_id: versionId }),
    },
  );
}
