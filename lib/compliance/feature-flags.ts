/**
 * Sprint 0: compliance feature flags.
 *
 * Pure functions, no module-level env caching — tests pass explicit env
 * objects. Env values "true"/"1" enable, "false"/"0" disable
 * (case-insensitive); anything else falls back to per-environment defaults.
 *
 * Production defaults ON:  COMPLIANCE_EXPORT_GATE, EU_ART50_MACHINE_MARKING,
 *                          EU_ART50_STRICT_EXPORT_BLOCK, CN_AIGC_MACHINE_MARKING,
 *                          CN_AIGC_STRICT_EXPORT_BLOCK
 * Everything else (incl. UNMARKED_EXPORT_EXCEPTION) defaults OFF everywhere;
 * in non-production every flag defaults OFF.
 */

import type { ComplianceFlag } from "./types.ts";

export const COMPLIANCE_FLAGS = [
  "COMPLIANCE_EXPORT_GATE",
  "EU_ART50_MACHINE_MARKING",
  "EU_ART50_VISIBLE_DISCLOSURE",
  "EU_ART50_STRICT_EXPORT_BLOCK",
  "CN_AIGC_MACHINE_MARKING",
  "CN_AIGC_VISIBLE_MARKING",
  "CN_AIGC_STRICT_EXPORT_BLOCK",
  "DUAL_JURISDICTION_MARKING",
  "UNMARKED_EXPORT_EXCEPTION",
  "GDPR_REGION_ROUTING",
] as const satisfies readonly ComplianceFlag[];

export type { ComplianceFlag };

const PRODUCTION_DEFAULT_TRUE: readonly ComplianceFlag[] = [
  "COMPLIANCE_EXPORT_GATE",
  "EU_ART50_MACHINE_MARKING",
  "EU_ART50_STRICT_EXPORT_BLOCK",
  "CN_AIGC_MACHINE_MARKING",
  "CN_AIGC_STRICT_EXPORT_BLOCK",
];

function defaultFor(flag: ComplianceFlag, isProduction: boolean): boolean {
  return isProduction && PRODUCTION_DEFAULT_TRUE.includes(flag);
}

export function resolveComplianceFlags(env: NodeJS.ProcessEnv = process.env): Record<ComplianceFlag, boolean> {
  const isProduction = env.NODE_ENV === "production";
  const resolved = {} as Record<ComplianceFlag, boolean>;
  for (const flag of COMPLIANCE_FLAGS) {
    resolved[flag] = defaultFor(flag, isProduction);
    const raw = env[flag];
    if (typeof raw !== "string") continue;
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") resolved[flag] = true;
    else if (normalized === "false" || normalized === "0") resolved[flag] = false;
  }
  return resolved;
}

export function isComplianceFlagEnabled(flag: ComplianceFlag, env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveComplianceFlags(env)[flag];
}
