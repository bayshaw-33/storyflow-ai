import { readNestedString, readString, requestJson } from "./helpers";
import { getGmiOrganizationId, getGmiRequestQueueBaseUrl } from "./gmi";

export type GmiReconciliationInput = {
  apiKey: string;
  model: string;
  prompt: string;
  lyrics: string;
  submittedAt: number;
  claimedTaskIds?: ReadonlySet<string>;
};

export type GmiAcceptedRequest = {
  providerTaskId: string;
  createdAt: string;
};

function rowsFromResponse(data: Record<string, unknown>): Array<Record<string, unknown>> {
  for (const key of ["requests", "data", "items", "results"]) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  return [];
}

function requestCreatedAt(row: Record<string, unknown>): number {
  const value = row.created_at ?? row.createdAt ?? row.submitted_at ?? row.timestamp;
  if (typeof value === "number") return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function requestText(row: Record<string, unknown>, key: "prompt" | "lyrics"): string {
  return readString(row[key])
    || readNestedString(row, [["payload", key], ["input", key], ["request", "payload", key]])
    || "";
}

function requestModel(row: Record<string, unknown>): string {
  return readString(row.model_id) || readString(row.model) || readNestedString(row, [["request", "model"], ["payload", "model"]]) || "";
}

function requestId(row: Record<string, unknown>): string {
  return readString(row.request_id) || readString(row.task_id) || readString(row.id) || "";
}

export async function findAcceptedGmiRequest(input: GmiReconciliationInput): Promise<GmiAcceptedRequest | null> {
  const query = new URLSearchParams({ model_id: input.model });
  const data = await requestJson(`${getGmiRequestQueueBaseUrl()}/requests?${query.toString()}`, input.apiKey, { method: "GET" }, { organizationId: getGmiOrganizationId() || undefined });
  const lowerBound = input.submittedAt - 30_000;
  const upperBound = Date.now() + 30_000;
  const candidates = rowsFromResponse(data)
    .map((row) => ({ row, id: requestId(row), createdAt: requestCreatedAt(row) }))
    .filter(({ row, id, createdAt }) => {
      if (!id || input.claimedTaskIds?.has(id)) return false;
      if (createdAt && (createdAt < lowerBound || createdAt > upperBound)) return false;
      if (requestModel(row) && requestModel(row) !== input.model) return false;
      return requestText(row, "prompt") === input.prompt && requestText(row, "lyrics") === input.lyrics;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
  const match = candidates[0];
  return match ? { providerTaskId: match.id, createdAt: new Date(match.createdAt || Date.now()).toISOString() } : null;
}
