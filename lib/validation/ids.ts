const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function normalizeOptionalUuid(value: unknown, field = "id"): string | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (!isUuid(value)) throw new Error(`INVALID_${field.toUpperCase()}_UUID`);
  return value.trim();
}
