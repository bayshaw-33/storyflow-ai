import { appendCreativeEvent, type CreativeEventsFetcher } from "../server/v2/events/index";

const EVENT_BY_STATUS: Record<string, string> = {
  queued: "task_queued",
  generating: "task_running",
  result_ingesting: "task_ingesting",
  completed: "task_completed",
  failed: "task_failed",
  provider_timeout: "task_failed",
};

export function audioKkEventType(status: string): string {
  return EVENT_BY_STATUS[status] || "task_running";
}

export async function recordAudioJobEvent(input: {
  fetcher: CreativeEventsFetcher;
  userId: string;
  jobId: string;
  status: string;
  provider: string;
  model?: string | null;
  kind: "music" | "tts";
}) {
  return appendCreativeEvent({
    fetcher: input.fetcher,
    userId: input.userId,
    input: {
      eventType: audioKkEventType(input.status),
      schemaVersion: 1,
      actorType: "system",
      actorId: null,
      ownerId: input.userId,
      resourceType: "audio_job",
      resourceId: input.jobId,
      resourceVersion: input.status,
      taskId: input.jobId,
      idempotencyKey: `audio:${input.jobId}:${input.status}`,
      visibility: "private",
      payload: {
        stage: input.status,
        provider: input.provider,
        model: input.model || null,
        kind: input.kind,
      },
      occurredAt: new Date().toISOString(),
    },
  });
}
