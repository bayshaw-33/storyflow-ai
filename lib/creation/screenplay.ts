import type {
  CreationMode,
  CreationUnit,
  CreationWorkspaceV2,
  ScreenplayBlock,
  ScreenplayEpisode,
  ScreenplayFormat,
  ScreenplayScene,
} from "./types.ts";

export type ScreenplayLanguages = {
  screenplayLanguage: string;
  dialogueLanguage: string;
};

export type ScreenplayValidationWarning = {
  code: "missing_location" | "missing_characters" | "missing_scene_number" | "missing_dialogue_character";
  sceneId: string;
  message: string;
};

export type ScreenplayValidationResult = {
  valid: boolean;
  warnings: ScreenplayValidationWarning[];
};

function isChinese(language: string) {
  return /中文|chinese|zh-/i.test(language);
}

function scenePrefix(scene: ScreenplayScene) {
  return scene.interiorExterior === "INT/EXT" ? "INT./EXT." : `${scene.interiorExterior}.`;
}

function asianTime(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "DAY") return "日";
  if (normalized === "NIGHT") return "夜";
  if (normalized === "MORNING") return "晨";
  if (normalized === "EVENING") return "晚";
  return value.trim() || "未定";
}

function asianSpace(value: ScreenplayScene["interiorExterior"]) {
  if (value === "INT") return "内";
  if (value === "EXT") return "外";
  return "内/外";
}

function renderBlock(block: ScreenplayBlock, languages: ScreenplayLanguages) {
  if (block.type === "dialogue") {
    const translation = block.translation.trim()
      ? `\n> ${isChinese(languages.screenplayLanguage) ? "译文" : "Translation"}: ${block.translation.trim()}`
      : "";
    return `**${block.character.trim().toUpperCase()}**\n${block.text.trim()}${translation}`;
  }
  if (block.type === "parenthetical") return `*(${block.text.trim()})*`;
  if (block.type === "transition") return `**${block.text.trim().toUpperCase()}**`;
  if (block.type === "note") return `> ${block.text.trim()}`;
  return block.text.trim();
}

function renderInternationalScene(
  scene: ScreenplayScene,
  episodeNo: number,
  languages: ScreenplayLanguages,
) {
  const charactersLabel = isChinese(languages.screenplayLanguage) ? "人物" : "Characters";
  return [
    `## ${episodeNo}-${scene.sceneNo} ${scenePrefix(scene)} ${scene.location.trim()} - ${scene.timeOfDay.trim().toUpperCase()}`,
    `${charactersLabel}: ${scene.characters.map((name) => name.trim().toUpperCase()).join("、")}`,
    ...scene.blocks.map((block) => renderBlock(block, languages)),
  ].filter(Boolean).join("\n\n");
}

function renderHollywoodScene(scene: ScreenplayScene, languages: ScreenplayLanguages) {
  return [
    `## ${scenePrefix(scene)} ${scene.location.trim()} - ${scene.timeOfDay.trim().toUpperCase()}`,
    ...scene.blocks.map((block) => renderBlock(block, languages)),
  ].filter(Boolean).join("\n\n");
}

function renderAsianScene(scene: ScreenplayScene, languages: ScreenplayLanguages) {
  const charactersLabel = isChinese(languages.screenplayLanguage) ? "人物" : "Characters";
  return [
    `## ${scene.sceneNo}场｜${scene.location.trim()}｜${asianTime(scene.timeOfDay)}｜${asianSpace(scene.interiorExterior)}`,
    `${charactersLabel}: ${scene.characters.map((name) => name.trim().toUpperCase()).join("、")}`,
    ...scene.blocks.map((block) => renderBlock(block, languages)),
  ].filter(Boolean).join("\n\n");
}

export function renderScreenplayEpisode(
  episode: ScreenplayEpisode,
  format: ScreenplayFormat,
  languages: ScreenplayLanguages,
) {
  const heading = `# EP${String(episode.episodeNo).padStart(2, "0")}｜${episode.title}`;
  const loglineLabel = isChinese(languages.screenplayLanguage) ? "本集梗概" : "Logline";
  const scenes = episode.scenes.map((scene) => {
    if (format === "hollywood_spec") return renderHollywoodScene(scene, languages);
    if (format === "asian_production") return renderAsianScene(scene, languages);
    return renderInternationalScene(scene, episode.episodeNo, languages);
  });
  return [heading, episode.logline.trim() ? `- ${loglineLabel}: ${episode.logline.trim()}` : "", ...scenes]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTranslationSource(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unit: CreationUnit,
) {
  if (mode !== "screenplay" || !unit.screenplay) return unit.content.trim();
  return renderScreenplayEpisode(unit.screenplay, workspace.settings.screenplayFormat, {
    screenplayLanguage: workspace.settings.screenplayLanguage,
    dialogueLanguage: workspace.settings.dialogueLanguage,
  }).trim();
}

export function validateScreenplayEpisode(
  episode: ScreenplayEpisode,
  format: ScreenplayFormat,
): ScreenplayValidationResult {
  const warnings: ScreenplayValidationWarning[] = [];
  for (const scene of episode.scenes) {
    if (!scene.location.trim()) {
      warnings.push({ code: "missing_location", sceneId: scene.id, message: "Scene location is required." });
    }
    if (format !== "hollywood_spec" && scene.sceneNo < 1) {
      warnings.push({ code: "missing_scene_number", sceneId: scene.id, message: "Scene number is required." });
    }
    if (format !== "hollywood_spec" && scene.characters.length === 0) {
      warnings.push({ code: "missing_characters", sceneId: scene.id, message: "Production formats require a character list." });
    }
    for (const block of scene.blocks) {
      if (block.type === "dialogue" && !block.character.trim()) {
        warnings.push({ code: "missing_dialogue_character", sceneId: scene.id, message: "Dialogue requires a character." });
      }
    }
  }
  return { valid: warnings.length === 0, warnings };
}

export function autoFixScreenplayEpisode(
  episode: ScreenplayEpisode,
  _format: ScreenplayFormat,
): ScreenplayEpisode {
  return {
    ...episode,
    title: episode.title.trim(),
    logline: episode.logline.trim(),
    scenes: episode.scenes.map((scene, index) => ({
      ...scene,
      sceneNo: scene.sceneNo > 0 ? scene.sceneNo : index + 1,
      location: scene.location.trim(),
      timeOfDay: scene.timeOfDay.trim().toUpperCase(),
      characters: scene.characters.map((name) => name.trim().toUpperCase()).filter(Boolean),
      blocks: scene.blocks.map((block) => ({
        ...block,
        character: block.character.trim().toUpperCase(),
      })),
    })),
  };
}
