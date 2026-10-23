export type StoryboardSubview = "shot_table" | "grids" | "motion" | "prompts" | "canvas";
const aliases: Record<string, StoryboardSubview> = { shot_table: "shot_table", shots: "shot_table", grid: "grids", grids: "grids", dynamic: "motion", motion: "motion", prompts: "prompts", video_prompt: "prompts", canvas: "canvas", board: "canvas" };
export function readStoryboardSubview(params: Pick<URLSearchParams, "get">): StoryboardSubview {
  return aliases[params.get("view") || ""] || aliases[params.get("storyboardView") || ""] || "shot_table";
}
export function updateStoryboardSubview(params: URLSearchParams, subview: StoryboardSubview): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("storyboardView");
  next.set("view", subview);
  return next;
}
