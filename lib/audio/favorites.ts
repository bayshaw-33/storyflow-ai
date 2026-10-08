type MusicJob = { id: string; target_type: string; input_params: Record<string, unknown> | null };

export async function setMusicJobFavorite(
  fetcher: <T>(path: string, init?: RequestInit) => Promise<T>,
  input: { jobId: string; ownerId: string; projectId: string; favorite: boolean },
) {
  const scope = `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(input.jobId)}&owner_id=eq.${encodeURIComponent(input.ownerId)}&project_id=eq.${encodeURIComponent(input.projectId)}&job_type=eq.audio`;
  const rows = await fetcher<MusicJob[]>(`${scope}&select=id,target_type,input_params&limit=1`);
  const job = rows?.[0];
  if (!job || (job.input_params?.kind !== "music" && job.target_type !== "song_version")) throw new Error("MUSIC_JOB_NOT_FOUND");
  const updated = await fetcher<MusicJob[]>(scope, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ input_params: { ...job.input_params, favorite: input.favorite } }),
  });
  if (!updated?.[0]) throw new Error("MUSIC_FAVORITE_SAVE_FAILED");
  return { jobId: job.id, favorite: updated[0].input_params?.favorite === true };
}
