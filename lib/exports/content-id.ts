/** Server-only content identity for the Export Request pipeline. */

export interface ContentIdSeed {
  projectId?: string;
  exportType: string;
  sourceKind: string;
  providerCode: string;
  /** SHA-256 of the source payload, computed by the server. */
  payloadHash: string;
}

export function generateContentId(seed: ContentIdSeed): string {
  const payloadHash = seed.payloadHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(payloadHash)) {
    throw new Error("CONTENT_ID_SOURCE_HASH_REQUIRED");
  }
  return `cid_${payloadHash}`;
}
