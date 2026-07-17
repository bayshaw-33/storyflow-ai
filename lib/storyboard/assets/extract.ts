/**
 * Storyboard asset extraction — pure functions.
 *
 * Task card: KIIKIS-P1-KIMI-002 §2
 *
 * Validated AI asset output → StoryboardAssetUsage[] with:
 *   - server-assigned clientIds (p_asset_<kind>_<n>) — model-provided ids
 *     are discarded here and never survive;
 *   - dedupe by normalized name + kind (duplicates merged: union of
 *     aliases / visualKeywords, richest description kept);
 *   - art prompt built from the shared templates;
 *   - selectedVersionId: null (a version is only selected via the
 *     select-version API after images exist).
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import type { StoryboardAssetKind, StoryboardAssetUsage } from "../contracts.ts";
import type { AiAnalyzeOutput, AiAssetOutput } from "../analyze/types.ts";
import {
  buildCharacterArtPrompt,
  buildLocationArtPrompt,
  buildPropArtPrompt,
} from "../prompts/templates.ts";

/** Optional extension allowed by the task card (kept optional so the frozen
 * Codex contract stays compatible). */
export type StoryboardAssetUsageWithAliases = StoryboardAssetUsage & {
  aliases?: string[];
};

/**
 * Dedupe key: lowercase(trim(name)) with internal whitespace/punctuation
 * collapsed to a single space, prefixed by kind.
 */
export function storyboardAssetDedupeKey(kind: StoryboardAssetKind, name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[\s\p{P}\p{S}]+/gu, " ");
  return `${kind}:${normalized}`;
}

/** Allocate the next server-side asset clientId for a kind, continuing the
 * numbering of already-assigned p_asset_<kind>_<n> ids. */
export function allocateAssetClientId(
  kind: StoryboardAssetKind,
  existing: ReadonlyArray<{ assetId: string }>,
): string {
  const prefix = `p_asset_${kind}_`;
  let max = 0;
  for (const usage of existing) {
    if (usage.assetId.startsWith(prefix)) {
      const n = Number.parseInt(usage.assetId.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
}

function buildArtPrompt(kind: StoryboardAssetKind, asset: AiAssetOutput): string {
  const input = {
    name: asset.name,
    description: asset.description,
    visualKeywords: asset.visualKeywords,
    scriptBasis: asset.scriptBasis,
  };
  if (kind === "character") return buildCharacterArtPrompt(input);
  if (kind === "location") return buildLocationArtPrompt(input);
  return buildPropArtPrompt(input);
}

function unionStrings(left: string[], right: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...left, ...right]) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Keep the "richest" description: the longest non-empty one wins. */
function richest(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  return b.length > a.length ? b : a;
}

function mergeInto(target: StoryboardAssetUsageWithAliases, source: AiAssetOutput): void {
  target.description = richest(target.description, source.description);
  target.scriptBasis = richest(target.scriptBasis, source.scriptBasis);
  target.visualKeywords = unionStrings(target.visualKeywords, source.visualKeywords);
  const aliases = unionStrings(target.aliases ?? [], source.aliases);
  if (aliases.length > 0) target.aliases = aliases;
  // Rebuild the art prompt when a richer description arrived.
  target.prompt = buildArtPrompt(target.kind, {
    name: target.name,
    aliases: target.aliases ?? [],
    scriptBasis: target.scriptBasis,
    description: target.description,
    visualKeywords: target.visualKeywords,
  });
}

function toUsage(
  kind: StoryboardAssetKind,
  asset: AiAssetOutput,
  assetId: string,
): StoryboardAssetUsageWithAliases {
  const aliases = unionStrings([], asset.aliases);
  const usage: StoryboardAssetUsageWithAliases = {
    assetId,
    kind,
    name: asset.name.trim(),
    scriptBasis: asset.scriptBasis.trim(),
    description: asset.description.trim(),
    visualKeywords: unionStrings([], asset.visualKeywords),
    prompt: buildArtPrompt(kind, asset),
    selectedVersionId: null,
  };
  if (aliases.length > 0) usage.aliases = aliases;
  return usage;
}

/**
 * Extract + dedupe assets from validated AI output. Order is stable:
 * characters → locations → props, first occurrence wins the slot.
 */
export function extractAssetUsages(aiAssets: AiAnalyzeOutput["assets"]): StoryboardAssetUsageWithAliases[] {
  const byKey = new Map<string, StoryboardAssetUsageWithAliases>();
  const ordered: StoryboardAssetUsageWithAliases[] = [];
  const counters: Record<StoryboardAssetKind, number> = { character: 0, location: 0, prop: 0 };

  const groups: Array<[StoryboardAssetKind, AiAssetOutput[]]> = [
    ["character", aiAssets.characters],
    ["location", aiAssets.locations],
    ["prop", aiAssets.props],
  ];

  for (const [kind, assets] of groups) {
    for (const asset of assets) {
      const key = storyboardAssetDedupeKey(kind, asset.name);
      const existing = byKey.get(key);
      if (existing) {
        mergeInto(existing, asset);
        continue;
      }
      counters[kind] += 1;
      const usage = toUsage(kind, asset, `p_asset_${kind}_${counters[kind]}`);
      byKey.set(key, usage);
      ordered.push(usage);
    }
  }

  return ordered;
}

/**
 * Auto-create a minimal asset entry for a name referenced by a scene/shot
 * but absent from the AI asset list — references must never dangle.
 */
export function createMinimalAssetUsage(
  kind: StoryboardAssetKind,
  name: string,
  existing: ReadonlyArray<{ assetId: string }>,
): StoryboardAssetUsageWithAliases {
  const trimmed = name.trim();
  const asset: AiAssetOutput = {
    name: trimmed,
    aliases: [],
    scriptBasis: "",
    description: `${trimmed}（剧本引用，待补充设定）`,
    visualKeywords: [],
  };
  return toUsage(kind, asset, allocateAssetClientId(kind, existing));
}

/** Name lookup for reference resolution: matches name OR alias, normalized. */
export function findAssetByName(
  usages: ReadonlyArray<StoryboardAssetUsageWithAliases>,
  kind: StoryboardAssetKind,
  name: string,
): StoryboardAssetUsageWithAliases | null {
  const key = storyboardAssetDedupeKey(kind, name);
  for (const usage of usages) {
    if (usage.kind !== kind) continue;
    if (storyboardAssetDedupeKey(kind, usage.name) === key) return usage;
    for (const alias of usage.aliases ?? []) {
      if (storyboardAssetDedupeKey(kind, alias) === key) return usage;
    }
  }
  return null;
}
