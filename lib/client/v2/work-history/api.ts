/**
 * KIIKIS V2.2 Work History client API — Phase 1 Task 1.3.
 *
 * Thin client wrappers around the /api/v2/works/[workId]/* endpoints.
 * Clients use these to fetch versions, conversations, and trigger candidate
 * application. All mutations go through the server; the client never writes
 * directly to DB tables.
 */

import type {
  WorkVersionV22,
  ConversationMessageV22,
  GenerationRequestSnapshotV22,
  GenerationCandidateV22,
} from "@/lib/contracts/v2/work-history";

export interface WorkHistoryClient {
  listVersions(workId: string): Promise<WorkVersionV22[]>;
  appendVersion(workId: string, input: AppendVersionInput): Promise<WorkVersionV22>;
  createCheckpoint(workId: string, input: CheckpointInput): Promise<WorkVersionV22>;
  finalizeVersion(workId: string, input: FinalizeInput): Promise<WorkVersionV22>;
  listMessages(workId: string, threadId: string): Promise<ConversationMessageV22[]>;
  appendMessage(workId: string, threadId: string, input: AppendMessageInput): Promise<ConversationMessageV22>;
  createGenerationRequest(workId: string, input: CreateRequestInput): Promise<GenerationRequestSnapshotV22>;
  applyCandidate(workId: string, candidateId: string, input: ApplyCandidateInput): Promise<ApplyCandidateResult>;
}

export interface AppendVersionInput {
  parentVersionId?: string | null;
  kind: "editing_draft" | "checkpoint" | "finalized";
  contentSchema: string;
  content: unknown;
  source?: "manual" | "ai" | "import" | "restore";
  sourceMessageIds?: string[];
  sourceJobId?: string | null;
  idempotencyKey: string;
  expectedCurrentVersionId?: string | null;
}

export interface CheckpointInput {
  parentVersionId?: string | null;
  contentSchema: string;
  content: unknown;
  source?: "manual" | "ai" | "import" | "restore";
  idempotencyKey: string;
}

export interface FinalizeInput {
  versionId: string;
  idempotencyKey: string;
  sourceMessageIds?: string[];
  sourceJobId?: string | null;
}

export interface AppendMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
  baseVersionId?: string | null;
  idempotencyKey: string;
}

export interface CreateRequestInput {
  baseVersionId: string;
  messageIds: string[];
  contextPacketId?: string | null;
  operation: "discuss" | "propose_change" | "generate" | "update";
  idempotencyKey: string;
}

export interface ApplyCandidateInput {
  contentSchema: string;
  idempotencyKey: string;
}

export interface ApplyCandidateResult {
  candidateId: string;
  newVersionId: string;
  idempotentReplay: boolean;
}

async function parseJson(response: Response) {
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Request failed with status ${response.status}`);
  }
  return json;
}

/**
 * Create a work history client bound to a base URL (defaults to same-origin).
 */
export function createWorkHistoryClient(baseUrl = ""): WorkHistoryClient {
  return {
    async listVersions(workId: string): Promise<WorkVersionV22[]> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/versions`);
      const json = await parseJson(res);
      return json.versions;
    },

    async appendVersion(workId: string, input: AppendVersionInput): Promise<WorkVersionV22> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await parseJson(res);
      return json.version;
    },

    async createCheckpoint(workId: string, input: CheckpointInput): Promise<WorkVersionV22> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await parseJson(res);
      return json.version;
    },

    async finalizeVersion(workId: string, input: FinalizeInput): Promise<WorkVersionV22> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await parseJson(res);
      return json.version;
    },

    async listMessages(workId: string, threadId: string): Promise<ConversationMessageV22[]> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/conversations/${threadId}/messages`);
      const json = await parseJson(res);
      return json.messages;
    },

    async appendMessage(workId: string, threadId: string, input: AppendMessageInput): Promise<ConversationMessageV22> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/conversations/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await parseJson(res);
      return json.message;
    },

    async createGenerationRequest(workId: string, input: CreateRequestInput): Promise<GenerationRequestSnapshotV22> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/generation-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await parseJson(res);
      return json.request;
    },

    async applyCandidate(workId: string, candidateId: string, input: ApplyCandidateInput): Promise<ApplyCandidateResult> {
      const res = await fetch(`${baseUrl}/api/v2/works/${workId}/candidates/${candidateId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await parseJson(res);
      return {
        candidateId: json.candidateId,
        newVersionId: json.newVersionId,
        idempotentReplay: json.idempotentReplay,
      };
    },
  };
}
