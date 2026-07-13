import type {
  CreationArc,
  CreationMode,
  CreationUnit,
  CreationVersion,
  CreationWorkspaceV2,
  ScreenplayEpisode,
} from "./types.ts";

type ParsedUnit = Pick<CreationUnit, "number" | "title" | "outline" | "content"> & {
  screenplay: ScreenplayEpisode | null;
};

export type GenerationMetadata = {
  model: string;
  instruction: string;
  scope: "unit" | "arc" | string;
  createdAt?: string;
};

const OUTPUT_PATTERN = /<CREATION_OUTPUT>\s*([\s\S]*?)\s*<\/CREATION_OUTPUT>/i;

function parseMarkedJson(output: string): unknown {
  const match = output.match(OUTPUT_PATTERN);
  if (!match?.[1]) throw new Error("Malformed creation output: missing CREATION_OUTPUT markers.");
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error("Malformed creation output: invalid JSON.");
  }
}

function parseUnit(value: unknown, mode: CreationMode): ParsedUnit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed creation output: unit must be an object.");
  }
  const source = value as Record<string, unknown>;
  const number = Number(source.number);
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const outline = typeof source.outline === "string" ? source.outline.trim() : "";
  const content = typeof source.content === "string" ? source.content.trim() : "";
  const screenplay = mode === "screenplay" ? parseScreenplay(source.screenplay) : null;
  if (!Number.isInteger(number) || number < 1 || !title || (!content && !screenplay)) {
    throw new Error("Malformed creation output: number, title, and content are required.");
  }
  return { number, title, outline, content, screenplay };
}

function parseScreenplay(value: unknown): ScreenplayEpisode | null {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed creation output: screenplay must be an object.");
  }
  const episode = value as ScreenplayEpisode;
  if (!Number.isInteger(Number(episode.episodeNo)) || !Array.isArray(episode.scenes)) {
    throw new Error("Malformed creation output: screenplay episode number and scenes are required.");
  }
  return episode;
}

export function parseArcStructure(markdown: string, mode: CreationMode): CreationArc[] {
  const arcPattern = /^##\s*(?:大章|ARC)\s*(\d+)\s*[｜|:：-]?\s*(.*)$/i;
  const unitPattern = mode === "novel"
    ? /^###\s*(?:第\s*)?(\d+)\s*(?:章|CHAPTER)\s*[｜|:：-]?\s*(.*)$/i
    : /^###\s*(?:第\s*)?(\d+)\s*(?:集|EPISODE|EP)\s*[｜|:：-]?\s*(.*)$/i;
  const arcs: CreationArc[] = [];
  let current: CreationArc | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    const arcMatch = line.match(arcPattern);
    if (arcMatch) {
      const number = Number(arcMatch[1]);
      current = {
        id: `${mode}-arc-${number}`,
        number,
        title: arcMatch[2]?.trim() || `Arc ${number}`,
        outline: "",
        unitIds: [],
      };
      arcs.push(current);
      continue;
    }
    const unitMatch = line.match(unitPattern);
    if (unitMatch && current) {
      const number = Number(unitMatch[1]);
      current.unitIds.push(`${mode}-unit-${number}`);
      continue;
    }
    if (current && line && !line.startsWith("#") && !current.unitIds.length) {
      current.outline = current.outline ? `${current.outline}\n${line}` : line;
    }
  }
  return arcs.map((arc, index) => ({ ...arc, number: index + 1 }));
}

export function parseNovelUnitOutput(output: string): ParsedUnit {
  return parseUnit(parseMarkedJson(output), "novel");
}

export function parseScreenplayUnitOutput(output: string): ParsedUnit {
  return parseUnit(parseMarkedJson(output), "screenplay");
}

export function parseBatchUnitOutput(output: string, mode: CreationMode): ParsedUnit[] {
  const value = parseMarkedJson(output);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Malformed creation output: batch must contain at least one unit.");
  }
  return value.map((unit) => parseUnit(unit, mode));
}

export function applyUnitGeneration(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  output: string,
  metadata: GenerationMetadata,
): CreationWorkspaceV2 {
  const track = workspace[mode];
  const unitIndex = track.units.findIndex((unit) => unit.id === unitId);
  if (unitIndex < 0) throw new Error(`Creation unit not found: ${unitId}`);
  const current = track.units[unitIndex];
  if (current.status === "locked") throw new Error(`Creation unit is locked: ${unitId}`);

  const parsed = mode === "screenplay" ? parseScreenplayUnitOutput(output) : parseNovelUnitOutput(output);
  const createdAt = metadata.createdAt || new Date().toISOString();
  const version: CreationVersion = {
    id: `version-${createdAt}-${current.versions.length + 1}`,
    content: current.content,
    screenplay: current.screenplay,
    instruction: metadata.instruction,
    model: metadata.model,
    scope: metadata.scope,
    createdAt,
  };
  const next: CreationUnit = {
    ...current,
    number: parsed.number,
    title: parsed.title,
    outline: parsed.outline || current.outline,
    content: parsed.content,
    screenplay: parsed.screenplay,
    versions: [version, ...current.versions],
    updatedAt: createdAt,
  };
  const units = [...track.units];
  units[unitIndex] = next;
  return { ...workspace, [mode]: { ...track, units }, updatedAt: createdAt };
}

export function applyBatchGeneration(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  items: Array<{ unitId: string; output: string }>,
  metadata: GenerationMetadata,
) {
  let next = workspace;
  const failures: Array<{ unitId: string; error: string }> = [];
  for (const item of items) {
    try {
      next = applyUnitGeneration(next, mode, item.unitId, item.output, metadata);
    } catch (error) {
      failures.push({ unitId: item.unitId, error: error instanceof Error ? error.message : "Unknown generation error" });
    }
  }
  return { workspace: next, failures };
}

