export type CreativeWorkflowType = "novel" | "script" | "storyboard" | "video" | "song";

export type CreativeCharacter = {
  name: string;
  summary?: string;
  role?: string;
  appearance?: string;
  projectVariant?: Record<string, unknown>;
};

export type CreativeLocation = {
  name: string;
  summary?: string;
  visualNotes?: string;
};

export type CreativeScene = {
  id?: string;
  title: string;
  summary?: string;
  location?: string;
  shots?: Array<{
    id?: string;
    title?: string;
    prompt?: string;
    duration?: string;
    assetUrl?: string;
  }>;
};

export type CreativeAsset = {
  id?: string;
  type: "image" | "video" | "audio" | "document" | "prompt" | "storyboard";
  title: string;
  url?: string;
  prompt?: string;
  sourceSceneId?: string;
  sourceShotId?: string;
  metadata?: Record<string, unknown>;
};

export type CreativePackage = {
  id: string;
  workflowType: CreativeWorkflowType;
  title: string;
  summary?: string;
  language?: string;
  universeId?: string | null;
  sourceProjectId?: string | null;
  sourceProjectTitle?: string | null;
  characters?: CreativeCharacter[];
  locations?: CreativeLocation[];
  scenes?: CreativeScene[];
  assets?: CreativeAsset[];
  canonFacts?: string[];
  sourceText?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function creativePackageToSourceText(pkg: CreativePackage) {
  return [
    `Creative Package: ${pkg.title}`,
    `Workflow: ${pkg.workflowType}`,
    pkg.summary ? `Summary:\n${pkg.summary}` : "",
    pkg.sourceProjectTitle ? `Source project: ${pkg.sourceProjectTitle}` : "",
    pkg.characters?.length
      ? `Characters:\n${pkg.characters.map((item) => `- ${item.name}: ${[item.role, item.summary, item.appearance].filter(Boolean).join(" / ")}`).join("\n")}`
      : "",
    pkg.locations?.length
      ? `Locations:\n${pkg.locations.map((item) => `- ${item.name}: ${[item.summary, item.visualNotes].filter(Boolean).join(" / ")}`).join("\n")}`
      : "",
    pkg.scenes?.length
      ? `Scenes:\n${pkg.scenes.map((scene) => [
          `## ${scene.title}`,
          scene.location ? `Location: ${scene.location}` : "",
          scene.summary || "",
          scene.shots?.map((shot, index) => `Shot ${index + 1}: ${[shot.title, shot.prompt, shot.duration].filter(Boolean).join(" / ")}`).join("\n") || "",
        ].filter(Boolean).join("\n")).join("\n\n")}`
      : "",
    pkg.assets?.length
      ? `Assets:\n${pkg.assets.map((asset) => `- ${asset.type}: ${asset.title}${asset.url ? ` (${asset.url})` : ""}${asset.prompt ? ` / ${asset.prompt}` : ""}`).join("\n")}`
      : "",
    pkg.canonFacts?.length ? `Candidate facts:\n${pkg.canonFacts.map((item) => `- ${item}`).join("\n")}` : "",
    pkg.sourceText || "",
  ].filter(Boolean).join("\n\n");
}
