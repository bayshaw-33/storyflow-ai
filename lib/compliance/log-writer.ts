/**
 * Compliance Log Writer (sink pattern).
 *
 * This module deliberately does NOT import lib/supabase/server.ts so it
 * stays importable under Node type-stripping in unit tests — the API route
 * injects the real serviceFetch. All sink failures THROW (fail-closed):
 * a compliance record that cannot be persisted means no download.
 */

import type { ComplianceRunRow, LabelRecordRow } from "./types.ts";

export interface ComplianceLogSink {
  writeLabelRecord(row: LabelRecordRow): Promise<{ id: string }>;
  writeRunRecord(row: ComplianceRunRow): Promise<{ id: string }>;
}

export type ServiceFetchFn = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

/** In-memory sink for unit tests; ids are crypto.randomUUID(). */
export function createMemorySink(): ComplianceLogSink & { labelRows: LabelRecordRow[]; runRows: ComplianceRunRow[] } {
  const sink = {
    labelRows: [] as LabelRecordRow[],
    runRows: [] as ComplianceRunRow[],
    async writeLabelRecord(row: LabelRecordRow): Promise<{ id: string }> {
      const stored = { ...row, id: row.id ?? crypto.randomUUID() };
      sink.labelRows.push(stored);
      return { id: stored.id as string };
    },
    async writeRunRecord(row: ComplianceRunRow): Promise<{ id: string }> {
      const stored = { ...row, id: row.id ?? crypto.randomUUID() };
      sink.runRows.push(stored);
      return { id: stored.id as string };
    },
  };
  return sink;
}

/** Supabase PostgREST sink; the API route wires the real serviceFetch. */
export function createSupabaseSink(serviceFetchImpl: ServiceFetchFn): ComplianceLogSink {
  return {
    async writeLabelRecord(row: LabelRecordRow): Promise<{ id: string }> {
      const rows = await serviceFetchImpl<Array<{ id: string }>>("/rest/v1/storyflow_ai_label_records", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      const id = rows?.[0]?.id;
      if (!id) throw new Error("COMPLIANCE_RECORD_WRITE_FAILED: label record insert returned no id");
      return { id };
    },
    async writeRunRecord(row: ComplianceRunRow): Promise<{ id: string }> {
      const rows = await serviceFetchImpl<Array<{ id: string }>>("/rest/v1/storyflow_export_compliance_runs", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      const id = rows?.[0]?.id;
      if (!id) throw new Error("COMPLIANCE_RECORD_WRITE_FAILED: run record insert returned no id");
      return { id };
    },
  };
}
