import { NextRequest, NextResponse } from "next/server";
import { POST as createAudioJob } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MusicCandidate = {
  label: "A" | "B";
  prompt?: string;
  lyrics?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    kind?: string;
    candidates?: MusicCandidate[];
    targetType?: string;
    targetId?: string;
    projectId?: string | null;
    inputParams?: Record<string, unknown>;
  } | null;
  if (body?.kind !== "music" || !Array.isArray(body.candidates) || body.candidates.length !== 2) {
    return NextResponse.json({ success: false, error: "音乐批次必须包含 A、B 两个候选。", code: "INVALID_AUDIO_BATCH" }, { status: 422 });
  }

  const labels = new Set(body.candidates.map((candidate) => candidate.label));
  if (!labels.has("A") || !labels.has("B") || body.candidates.some((candidate) => !candidate.prompt?.trim() && !candidate.lyrics?.trim())) {
    return NextResponse.json({ success: false, error: "A、B 候选都需要有效的曲风或歌词。", code: "INVALID_AUDIO_BATCH" }, { status: 422 });
  }

  const batchId = crypto.randomUUID();
  const jobs = await Promise.all(body.candidates.map(async (candidate) => {
    const childRequest = new NextRequest(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        kind: "music",
        prompt: candidate.prompt || candidate.lyrics || "",
        lyrics: candidate.lyrics || "",
        targetType: body.targetType || "song_version",
        targetId: body.targetId || "standalone-song",
        requestKey: `${batchId}:${candidate.label}`,
        projectId: body.projectId || null,
        inputParams: { ...(body.inputParams || {}), batchId, candidate: candidate.label },
      }),
    });
    const response = await createAudioJob(childRequest);
    const payload = await response.json().catch(() => ({})) as { job?: Record<string, unknown>; error?: string; code?: string; status?: string };
    return { label: candidate.label, job: payload.job || null, error: payload.error || null, code: payload.code || null, status: payload.status || payload.job?.status || null };
  }));

  return NextResponse.json({
    success: jobs.some((item) => item.job),
    batchId,
    jobs,
  }, { status: 202 });
}
