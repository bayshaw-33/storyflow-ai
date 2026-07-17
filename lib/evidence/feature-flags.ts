/** Evidence writes stay disabled until the target environment has the ledger migration. */
export function isEvidenceLedgerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.EVIDENCE_LEDGER_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1";
}
