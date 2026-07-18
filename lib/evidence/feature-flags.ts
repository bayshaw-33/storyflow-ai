/** Evidence is available after the ledger rollout; operators can still disable it explicitly. */
export function isEvidenceLedgerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.EVIDENCE_LEDGER_ENABLED?.trim().toLowerCase();
  return value !== "false" && value !== "0";
}
