/** Recover an unambiguous episode identity; never fabricate IDs or pick among multiple episodes. */
export function resolveProjectSourceUnitId(data: Record<string, unknown> | null | undefined): string | null {
  const explicit = data?.sourceUnitId ?? data?.source_unit_id;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const workspace = data?.creationWorkspace as { screenplay?: { units?: Array<{ id?: string; status?: string }> } } | undefined;
  const units = workspace?.screenplay?.units;
  if (!Array.isArray(units)) return null;
  const finalized = units.filter(unit => unit.status === 'finalized' && typeof unit.id === 'string' && unit.id.trim());
  return finalized.length === 1 ? finalized[0].id! : null;
}
