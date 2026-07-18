import type { DramaProject } from "@/lib/projects";
import type { CanonCheckIssue, CanonCheckReport, UniverseBundle, UniverseInboxItem } from "@/lib/universe";
import { creativePackageToSourceText, type CreativePackage } from "../universe/creative-package.ts";
import { callDeepSeek } from "./providers/deepseek.ts";

type ExtractInput = {
  universeId: string;
  project?: DramaProject;
  creativePackage?: CreativePackage;
  userId: string;
};

type CanonCheckInput = {
  bundle: UniverseBundle;
  project: DramaProject;
  userId: string;
};

export type UniverseExtractionResult = {
  items: UniverseInboxItem[];
  degraded: boolean;
  source: "ai" | "fallback";
  error: string | null;
};

export async function extractUniverseInboxItems(input: ExtractInput): Promise<UniverseExtractionResult> {
  const sourceText = buildExtractionSourceText(input);
  const prompt = [
    "Extract candidate IP universe updates from this StoryFlow project.",
    "Return strict JSON with arrays: characters, locations, organizations, relationships, timeline_events, canon_facts, state_changes, unresolved_threads.",
    "Rules: only extract facts supported by the text; every item needs title, summary or fact_text, source_excerpt, confidence from 0 to 1.",
    "Do not write canon. These are inbox suggestions for user review.",
    "",
    sourceText.slice(0, 30000),
  ].join("\n");

  try {
    const result = await callDeepSeek({
      temperature: 0.2,
      maxTokens: 6000,
      messages: [
        { role: "system", content: "You are a JSON-only continuity extraction assistant for serialized drama IP." },
        { role: "user", content: prompt },
      ],
    });
    const parsed = parseJsonObject(result.output);
    const inbox = normalizeExtractedJson(parsed, input);
    if (inbox.length) {
      return { items: inbox, degraded: false, source: "ai", error: null };
    }
    return degradedExtraction(input, "AI extraction returned no usable items; deterministic fallback output is marked as source=fallback.");
  } catch (error) {
    return degradedExtraction(input, errorMessage(error));
  }
}

export async function runCanonCheck(input: CanonCheckInput): Promise<Omit<CanonCheckReport, "id" | "created_at">> {
  const canonContext = buildCanonContext(input.bundle);
  const projectText = buildProjectSourceText(input.project);

  let output: string;
  try {
    const result = await callDeepSeek({
      temperature: 0.15,
      maxTokens: 5000,
      messages: [
        {
          role: "system",
          content:
            "You are StoryFlow Canon Check. Return strict JSON: { score:number, issues:[{severity,title,description,related_canon_fact_id,source_excerpt,suggested_fix}], suggestions:[...] }.",
        },
        {
          role: "user",
          content: [
            "Check whether the target project violates the universe canon. Cite specific canon facts where possible.",
            "",
            "CANON:",
            canonContext,
            "",
            "TARGET PROJECT:",
            projectText.slice(0, 30000),
          ].join("\n"),
        },
      ],
    });
    output = result.output;
  } catch (error) {
    throw new Error(`CANON_CHECK_AI_UNAVAILABLE: ${errorMessage(error)}`);
  }

  const parsed = parseJsonObject(output);
  if (!Object.keys(parsed).length) {
    throw new Error("CANON_CHECK_INVALID_AI_OUTPUT");
  }
  const issues = normalizeIssues(parsed.issues, input.bundle);
  return {
    universe_id: input.bundle.universe.id,
    project_id: input.project.id,
    user_id: input.userId,
    target_scope: "project",
    score: clampScore(Number(parsed.score ?? 100 - issues.length * 18)),
    issues_json: issues,
    suggestions_json: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
}

function degradedExtraction(input: ExtractInput, reason: string): UniverseExtractionResult {
  return {
    items: markFallbackItems(heuristicInboxItems(input)),
    degraded: true,
    source: "fallback",
    error: reason,
  };
}

function markFallbackItems(items: UniverseInboxItem[]): UniverseInboxItem[] {
  return items.map((item) => ({
    ...item,
    confidence: 0.3,
    proposed_payload: { ...item.proposed_payload, source: "fallback" },
  }));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "UNKNOWN_AI_ERROR");
}

function normalizeExtractedJson(parsed: Record<string, unknown>, input: ExtractInput): UniverseInboxItem[] {
  const now = new Date().toISOString();
  const items: UniverseInboxItem[] = [];

  const push = (item_type: UniverseInboxItem["item_type"], raw: Record<string, unknown>, fallbackTitle: string) => {
    const title = stringValue(raw.title) || stringValue(raw.name) || stringValue(raw.fact_text) || fallbackTitle;
    if (!title.trim()) return;
    items.push({
      id: createId(),
      universe_id: input.universeId,
      user_id: input.userId,
      project_id: getInputProjectId(input),
      item_type,
      title,
      proposed_payload: raw,
      source_excerpt: stringValue(raw.source_excerpt) || stringValue(raw.summary) || title,
      confidence: clampConfidence(Number(raw.confidence ?? 0.7)),
      status: "pending",
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    });
  };

  arrayObjects(parsed.characters).forEach((raw) => push("character", raw, "Character"));
  arrayObjects(parsed.locations).forEach((raw) => push("location", raw, "Location"));
  arrayObjects(parsed.organizations).forEach((raw) => push("rule", { ...raw, type: "organization" }, "Organization"));
  arrayObjects(parsed.relationships).forEach((raw) => push("relationship", raw, "Relationship"));
  arrayObjects(parsed.timeline_events).forEach((raw) => push("event", raw, "Timeline event"));
  arrayObjects(parsed.canon_facts).forEach((raw) => push("canon_fact", raw, "Canon fact"));
  arrayObjects(parsed.state_changes).forEach((raw) => push("state_change", raw, "State change"));
  arrayObjects(parsed.unresolved_threads).forEach((raw) => push("canon_fact", { ...raw, category: "production_rule", importance: "medium" }, "Unresolved thread"));

  return items;
}

function heuristicInboxItems(input: ExtractInput): UniverseInboxItem[] {
  if (input.creativePackage && !input.project) return heuristicCreativePackageInboxItems(input);

  const now = new Date().toISOString();
  const items: UniverseInboxItem[] = [];
  const project = input.project;
  if (!project) return items;
  const characters = project.characterCards.slice(0, 12);

  for (const card of characters) {
    items.push({
      id: createId(),
      universe_id: input.universeId,
      user_id: input.userId,
      project_id: project.id,
      item_type: "character",
      title: card.name || "Unnamed character",
      proposed_payload: {
        name: card.name,
        summary: [card.role, card.identity, card.goal].filter(Boolean).join(" / "),
        identity: card.identity,
        goal: card.goal,
        secret: card.secret,
        personality: card.line,
        current_state: card.arc,
        locked_facts: [card.secret, card.identity].filter(Boolean),
      },
      source_excerpt: [card.identity, card.goal, card.secret].filter(Boolean).join("\n").slice(0, 500),
      confidence: 0.74,
      status: "pending",
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  const factTexts = [
    project.storyBible?.lockedCanon,
    project.storyBible?.confirmedFacts,
    project.brief,
    project.outline,
    project.storyboardScript,
    project.deliveryPackage,
    project.finalScript,
    project.novelBible,
    project.novelBrief,
    project.novelVolumeOutline,
    project.novelContinuityNotes,
  ]
    .filter(Boolean)
    .join("\n")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, "").trim())
    .filter((line) => line.length > 12)
    .slice(0, 12);

  for (const line of factTexts) {
    items.push({
      id: createId(),
      universe_id: input.universeId,
      user_id: input.userId,
      project_id: project.id,
      item_type: "canon_fact",
      title: line.slice(0, 80),
      proposed_payload: {
        fact_text: line,
        category: /mother|secret|identity|heir|母|身份|继承/i.test(line) ? "secret" : "character",
        importance: /must|never|locked|禁|不能|真相|alive|dead|死亡|活/i.test(line) ? "critical" : "medium",
        is_locked: true,
      },
      source_excerpt: line,
      confidence: 0.66,
      status: "pending",
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  items.push({
    id: createId(),
    universe_id: input.universeId,
    user_id: input.userId,
    project_id: project.id,
    item_type: "state_change",
    title: `${project.title} ending state`,
    proposed_payload: {
      title: `${project.title} ending state`,
      summary: project.finalScript || project.deliveryPackage || project.storyboardScript || project.novelChapterDraft || project.outline || project.storyBible?.mainConflict || "",
      workflow_type: project.workflowType,
      season_number: project.seasonNumber || 1,
      character_states: characters.map((card) => ({ name: card.name, state: card.arc || card.goal })),
      relationship_states: project.relationshipDiagram,
      unresolved_threads: project.novelContinuityNotes || project.storyBible?.confirmedFacts || "",
      production_assets: extractProjectProductionAssets(project),
    },
    source_excerpt: [
      project.deliveryPackage,
      project.storyboardScript,
      project.novelVolumeOutline,
      project.novelChapterDraft,
      project.outline,
      project.finalScript,
    ].filter(Boolean).join("\n\n").slice(0, 800),
    confidence: 0.6,
    status: "pending",
    reviewed_at: null,
    created_at: now,
    updated_at: now,
  });

  return items;
}

function extractProjectProductionAssets(project: DramaProject) {
  const assets: Array<Record<string, unknown>> = [];

  const storyboardState = parseObject(project.storyboardScript);
  const storyboardScenes = Array.isArray(storyboardState?.scenes) ? storyboardState.scenes : [];
  if (storyboardScenes.length) {
    assets.push({
      type: "storyboard",
      title: `${project.title} storyboard`,
      scene_count: storyboardScenes.length,
      source_workflow: project.workflowType,
    });
  }

  const deliveryPayload = parseObject(project.deliveryPackage);
  const deliveryState = deliveryPayload && typeof deliveryPayload.state === "object" && deliveryPayload.state && !Array.isArray(deliveryPayload.state)
    ? deliveryPayload.state as Record<string, unknown>
    : null;
  const videoShots = Array.isArray(deliveryState?.shots) ? deliveryState.shots : [];
  if (videoShots.length) {
    assets.push({
      type: "video",
      title: `${project.title} video queue`,
      shot_count: videoShots.length,
      completed_count: videoShots.filter((shot: unknown) => Boolean(shot) && typeof shot === "object" && stringValue((shot as Record<string, unknown>).status) === "done").length,
      source_workflow: project.workflowType,
    });
  }

  if (project.workflowType === "song" && (project.finalScript || project.deliveryPackage || project.brief)) {
    assets.push({
      type: "audio",
      title: `${project.title} song package`,
      has_lyrics: Boolean(project.finalScript),
      source_workflow: "song",
    });
  }

  return assets;
}

function heuristicCreativePackageInboxItems(input: ExtractInput): UniverseInboxItem[] {
  const pkg = input.creativePackage;
  if (!pkg) return [];
  const now = new Date().toISOString();
  const items: UniverseInboxItem[] = [];
  const projectId = getInputProjectId(input);

  for (const character of (pkg.characters || []).slice(0, 20)) {
    if (!character.name?.trim()) continue;
    items.push({
      id: createId(),
      universe_id: input.universeId,
      user_id: input.userId,
      project_id: projectId,
      item_type: "character",
      title: character.name,
      proposed_payload: {
        name: character.name,
        summary: character.summary || character.role || "",
        role: character.role || "",
        appearance: character.appearance || "",
        project_variant: character.projectVariant || null,
        source_workflow: pkg.workflowType,
        source_package_id: pkg.id,
      },
      source_excerpt: [character.summary, character.appearance].filter(Boolean).join("\n").slice(0, 500),
      confidence: 0.7,
      status: "pending",
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  for (const location of (pkg.locations || []).slice(0, 20)) {
    if (!location.name?.trim()) continue;
    items.push({
      id: createId(),
      universe_id: input.universeId,
      user_id: input.userId,
      project_id: projectId,
      item_type: "location",
      title: location.name,
      proposed_payload: {
        name: location.name,
        summary: location.summary || location.visualNotes || "",
        visual_notes: location.visualNotes || "",
        source_workflow: pkg.workflowType,
        source_package_id: pkg.id,
      },
      source_excerpt: [location.summary, location.visualNotes].filter(Boolean).join("\n").slice(0, 500),
      confidence: 0.7,
      status: "pending",
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  for (const fact of (pkg.canonFacts || []).filter(Boolean).slice(0, 16)) {
    items.push({
      id: createId(),
      universe_id: input.universeId,
      user_id: input.userId,
      project_id: projectId,
      item_type: "canon_fact",
      title: fact.slice(0, 80),
      proposed_payload: {
        fact_text: fact,
        category: pkg.workflowType === "storyboard" || pkg.workflowType === "video" ? "production_rule" : "character",
        importance: "medium",
        is_locked: false,
        source_workflow: pkg.workflowType,
        source_package_id: pkg.id,
      },
      source_excerpt: fact,
      confidence: 0.64,
      status: "pending",
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  items.push({
    id: createId(),
    universe_id: input.universeId,
    user_id: input.userId,
    project_id: projectId,
    item_type: "state_change",
    title: `${pkg.title} ${pkg.workflowType} package`,
    proposed_payload: {
      title: pkg.title,
      summary: pkg.summary || "",
      workflow_type: pkg.workflowType,
      package_id: pkg.id,
      source_project_id: pkg.sourceProjectId || null,
      scenes: pkg.scenes || [],
      assets: pkg.assets || [],
      metadata: pkg.metadata || {},
    },
    source_excerpt: creativePackageToSourceText(pkg).slice(0, 900),
    confidence: 0.68,
    status: "pending",
    reviewed_at: null,
    created_at: now,
    updated_at: now,
  });

  return items;
}

function normalizeIssues(value: unknown, bundle: UniverseBundle): CanonCheckIssue[] {
  const factIds = new Set(bundle.canonFacts.map((fact) => fact.id));
  return arrayObjects(value)
    .map((item): CanonCheckIssue => ({
      severity: normalizeSeverity(item.severity),
      title: stringValue(item.title) || "Continuity issue",
      description: stringValue(item.description),
      related_canon_fact_id: factIds.has(stringValue(item.related_canon_fact_id)) ? stringValue(item.related_canon_fact_id) : null,
      source_excerpt: stringValue(item.source_excerpt),
      suggested_fix: stringValue(item.suggested_fix),
    }))
    .filter((item) => item.title && item.description)
    .slice(0, 20);
}

function normalizeSeverity(value: unknown): CanonCheckIssue["severity"] {
  return value === "critical" || value === "warning" || value === "note" ? value : "warning";
}

function buildProjectSourceText(project: DramaProject) {
  return [
    `Title: ${project.title}`,
    `Workflow: ${project.workflowType}`,
    `Market: ${project.market}`,
    `Genre: ${project.genre}`,
    "Story Bible:",
    JSON.stringify(project.storyBible || {}, null, 2),
    "Idea:",
    project.idea,
    "Imported source:",
    project.importedScript,
    "Brief:",
    project.brief,
    "Characters:",
    project.characters,
    "Relationship diagram:",
    project.relationshipDiagram,
    "Outline:",
    project.outline,
    "Chinese script:",
    project.chineseScript,
    "Continuation script:",
    project.continuationScript,
    "Final script:",
    project.finalScript || project.finalScriptForeign || project.finalScriptChinese,
    "Storyboard package:",
    project.storyboardScript,
    "Storyboard episodes:",
    (project.storyboardEpisodes || []).map((episode) => `# ${episode.title}\n${episode.content}`).join("\n\n"),
    "Delivery package:",
    project.deliveryPackage,
    "Format check:",
    project.formatCheck,
    "Novel brief:",
    project.novelBrief,
    "Novel bible:",
    project.novelBible,
    "Novel characters:",
    project.novelCharacters,
    "Novel volume outline:",
    project.novelVolumeOutline,
    "Novel chapters:",
    (project.novelChapters || []).map((chapter) => `#${chapter.chapterNo} ${chapter.title}\n${chapter.outline}\n${chapter.draft}\n${chapter.continuityNotes}`).join("\n\n"),
  ].filter(Boolean).join("\n\n");
}

function buildExtractionSourceText(input: ExtractInput) {
  if (input.creativePackage) return creativePackageToSourceText(input.creativePackage);
  if (input.project) return buildProjectSourceText(input.project);
  return "";
}

function getInputProjectId(input: ExtractInput) {
  return input.project?.id || input.creativePackage?.sourceProjectId || input.creativePackage?.id || null;
}

function buildCanonContext(bundle: UniverseBundle) {
  return [
    `Universe: ${bundle.universe.name}`,
    bundle.universe.description,
    "Characters:",
    bundle.entities.filter((item) => item.type === "character").map((item) => `- ${item.id}: ${item.name} - ${item.summary}`).join("\n"),
    "Relationships:",
    bundle.relationships.map((item) => `- ${item.summary}`).join("\n"),
    "Timeline:",
    bundle.timeline.map((item) => `- ${item.date_label}: ${item.title} - ${item.description}`).join("\n"),
    "Canon facts:",
    bundle.canonFacts.map((item) => `- ${item.id} [${item.importance}${item.is_locked ? ", locked" : ""}]: ${item.fact_text}`).join("\n"),
    "State:",
    bundle.snapshots.map((item) => `- ${item.title}: ${item.summary}`).join("\n"),
  ].filter(Boolean).join("\n\n");
}

function parseJsonObject(output: string): Record<string, unknown> {
  const cleaned = output.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const match = cleaned.match(/\{[\s\S]*\}/);
  const extracted = match ? tryParse(match[0]) : null;
  if (extracted) return extracted;
  return {};
}

function tryParse(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function arrayObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseObject(value: string) {
  if (!value.trim()) return null;
  return tryParse(value);
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 80;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
