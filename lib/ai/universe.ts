import type { DramaProject } from "@/lib/projects";
import type { CanonCheckIssue, CanonCheckReport, UniverseBundle, UniverseInboxItem } from "@/lib/universe";
import { callMiniMax } from "@/lib/ai/providers/minimax";

type ExtractInput = {
  universeId: string;
  project: DramaProject;
  userId: string;
};

type CanonCheckInput = {
  bundle: UniverseBundle;
  project: DramaProject;
  userId: string;
};

export async function extractUniverseInboxItems(input: ExtractInput): Promise<UniverseInboxItem[]> {
  const sourceText = buildProjectSourceText(input.project);
  const prompt = [
    "Extract candidate IP universe updates from this StoryFlow project.",
    "Return strict JSON with arrays: characters, locations, organizations, relationships, timeline_events, canon_facts, state_changes, unresolved_threads.",
    "Rules: only extract facts supported by the text; every item needs title, summary or fact_text, source_excerpt, confidence from 0 to 1.",
    "Do not write canon. These are inbox suggestions for user review.",
    "",
    sourceText.slice(0, 30000),
  ].join("\n");

  try {
    const result = await callMiniMax({
      temperature: 0.2,
      maxTokens: 6000,
      messages: [
        { role: "system", content: "You are a JSON-only continuity extraction assistant for serialized drama IP." },
        { role: "user", content: prompt },
      ],
    });
    const parsed = parseJsonObject(result.output);
    const inbox = normalizeExtractedJson(parsed, input);
    if (inbox.length) return inbox;
  } catch {
    // Fall back to deterministic extraction below.
  }

  return heuristicInboxItems(input);
}

export async function runCanonCheck(input: CanonCheckInput): Promise<Omit<CanonCheckReport, "id" | "created_at">> {
  const canonContext = buildCanonContext(input.bundle);
  const projectText = buildProjectSourceText(input.project);

  try {
    const result = await callMiniMax({
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
    const parsed = parseJsonObject(result.output);
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
  } catch {
    const issues = heuristicCanonIssues(input);
    return {
      universe_id: input.bundle.universe.id,
      project_id: input.project.id,
      user_id: input.userId,
      target_scope: "project",
      score: clampScore(issues.length ? 100 - issues.length * 24 : 92),
      issues_json: issues,
      suggestions_json: issues.map((issue) => ({ title: issue.title, suggested_fix: issue.suggested_fix })),
    };
  }
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
      project_id: input.project.id,
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
  const now = new Date().toISOString();
  const items: UniverseInboxItem[] = [];
  const characters = input.project.characterCards.slice(0, 12);

  for (const card of characters) {
    items.push({
      id: createId(),
      universe_id: input.universeId,
      user_id: input.userId,
      project_id: input.project.id,
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
    input.project.storyBible?.lockedCanon,
    input.project.storyBible?.confirmedFacts,
    input.project.brief,
    input.project.outline,
    input.project.novelBible,
    input.project.novelBrief,
    input.project.novelVolumeOutline,
    input.project.novelContinuityNotes,
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
      project_id: input.project.id,
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
    project_id: input.project.id,
    item_type: "state_change",
    title: `${input.project.title} ending state`,
    proposed_payload: {
      title: `${input.project.title} ending state`,
      summary: input.project.finalScript || input.project.novelChapterDraft || input.project.outline || input.project.storyBible?.mainConflict || "",
      season_number: input.project.seasonNumber || 1,
      character_states: characters.map((card) => ({ name: card.name, state: card.arc || card.goal })),
      relationship_states: input.project.relationshipDiagram,
      unresolved_threads: input.project.novelContinuityNotes || input.project.storyBible?.confirmedFacts || "",
    },
    source_excerpt: [input.project.novelVolumeOutline, input.project.novelChapterDraft, input.project.outline, input.project.finalScript].filter(Boolean).join("\n\n").slice(0, 800),
    confidence: 0.6,
    status: "pending",
    reviewed_at: null,
    created_at: now,
    updated_at: now,
  });

  return items;
}

function heuristicCanonIssues(input: CanonCheckInput): CanonCheckIssue[] {
  const text = buildProjectSourceText(input.project).toLowerCase();
  const issues: CanonCheckIssue[] = [];

  for (const fact of input.bundle.canonFacts) {
    const factText = fact.fact_text.toLowerCase();
    const mentionsMotherAlive = /(mother|mom|母亲|妈妈).{0,30}(alive|still alive|活着|还活着)/i.test(fact.fact_text);
    const projectMotherDead = /(mother|mom|母亲|妈妈).{0,40}(dead|died|death|死亡|去世|死了)/i.test(text);
    if (mentionsMotherAlive && projectMotherDead) {
      issues.push({
        severity: "critical",
        title: "Mother survival canon conflict",
        description: "The universe canon says the mother is alive, but the target project states or implies she died.",
        related_canon_fact_id: fact.id,
        source_excerpt: findExcerpt(text, ["mother", "母亲", "dead", "死亡", "去世"]),
        suggested_fix: "Keep the mother alive, or make the death claim a lie, fake record, or character misconception.",
      });
    }

    const mentionsVisitedEstate = /(estate|manor|grey estate|庄园|府邸).{0,40}(visited|arrived|went|去过|到过|来过)/i.test(fact.fact_text);
    const projectFirstEstate = /(first time|第一次).{0,50}(estate|manor|grey estate|庄园|府邸)/i.test(text);
    if (mentionsVisitedEstate && projectFirstEstate) {
      issues.push({
        severity: "warning",
        title: "First-visit timeline conflict",
        description: "The target project claims a first visit to a location that canon indicates was already visited.",
        related_canon_fact_id: fact.id,
        source_excerpt: findExcerpt(text, ["first time", "第一次", "estate", "庄园"]),
        suggested_fix: "Change the scene to a return visit or specify it is the first visit under a new identity.",
      });
    }

    if (fact.is_locked && fact.importance === "critical" && text.includes("retcon") && factText.length > 20) {
      issues.push({
        severity: "note",
        title: "Locked fact retcon risk",
        description: "The draft appears to revise locked canon. Confirm whether this is a deliberate retcon.",
        related_canon_fact_id: fact.id,
        source_excerpt: "retcon",
        suggested_fix: "Move the change to Universe Inbox as an alternative instead of overwriting canon.",
      });
    }
  }

  return issues.slice(0, 12);
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
    `Market: ${project.market}`,
    `Genre: ${project.genre}`,
    "Story Bible:",
    JSON.stringify(project.storyBible || {}, null, 2),
    "Idea:",
    project.idea,
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

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 80;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function findExcerpt(text: string, needles: string[]) {
  const index = needles.map((needle) => text.indexOf(needle.toLowerCase())).find((item) => item >= 0) ?? -1;
  if (index < 0) return "";
  return text.slice(Math.max(0, index - 120), index + 240);
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
