import type { ProductionProjectState, ProductionShot } from "./types";

export function buildProductionContext(state: ProductionProjectState) {
  return [
    `项目：${state.title}`,
    `内容类型：${state.contentType === "mv" ? "MV / 歌曲视频" : "海外短剧"}`,
    `画幅：${state.aspectRatio}`,
    state.universeId ? `Universe：${state.universeId}` : "",
    state.storyBrief.logline ? `Logline：${state.storyBrief.logline}` : "",
    state.storyBrief.storySummary ? `故事概况：${state.storyBrief.storySummary}` : "",
    `视觉风格：${state.visualBible.visualStyle}`,
    `人物一致性：${state.visualBible.characterRules}`,
    state.sourceSummary ? `已上传资料摘要：${state.sourceSummary}` : "",
    state.sourceFiles.length
      ? `资料文件：${state.sourceFiles.map((file) => `${file.name}${file.textPreview ? ` - ${file.textPreview.slice(0, 160)}` : ""}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");
}

export function buildStoryboardChatPrompt(state: ProductionProjectState, userMessage: string) {
  return [
    "你是 Kiikis 的 AIGC 短剧制片分镜助理，负责把创作者的剧本、设定和反馈转成可生成图片与视频的结构化分镜。",
    "优先服务海外短剧，同时兼容 MV。保持镜头数量克制、画面可执行、角色与场景连续。",
    "输出必须能被前端解析为分镜列表；每条分镜都要包含画面类型、时长、画面描述、构图设计、运镜调度、图片提示词、视频提示词。",
    "如果用户要求修改已有分镜，只修改相关分镜，不要重写无关内容。",
    "",
    "项目上下文：",
    buildProductionContext(state),
    "",
    "用户本轮要求：",
    userMessage,
  ].join("\n");
}

export function buildShotImagePrompt(state: ProductionProjectState, shot: ProductionShot) {
  return [
    `Create a production-ready storyboard image for a ${state.contentType === "mv" ? "music video" : "vertical short drama"}.`,
    `Aspect ratio: ${state.aspectRatio}.`,
    `Visual style: ${state.visualBible.visualStyle}.`,
    state.visualBible.colorPalette ? `Color palette: ${state.visualBible.colorPalette}.` : "",
    state.visualBible.characterRules ? `Character continuity: ${state.visualBible.characterRules}.` : "",
    shot.sceneTitle ? `Scene: ${shot.sceneTitle}.` : "",
    shot.description ? `Shot description: ${shot.description}.` : "",
    shot.composition ? `Composition: ${shot.composition}.` : "",
    shot.cameraMovement ? `Camera movement intention: ${shot.cameraMovement}.` : "",
    shot.imagePrompt ? `Image prompt: ${shot.imagePrompt}.` : "",
    state.visualBible.negativePrompt ? `Avoid: ${state.visualBible.negativePrompt}.` : "",
  ].filter(Boolean).join("\n");
}

export function buildShotVideoPrompt(state: ProductionProjectState, shot: ProductionShot) {
  return [
    `Generate a short video clip for ${state.contentType === "mv" ? "an MV" : "a vertical short drama"}.`,
    `Aspect ratio: ${state.aspectRatio}.`,
    `Duration: ${shot.duration}.`,
    `Visual style: ${state.visualBible.visualStyle}.`,
    shot.description ? `Action and emotion: ${shot.description}.` : "",
    shot.cameraMovement ? `Camera movement: ${shot.cameraMovement}.` : "",
    shot.videoPrompt ? `Video prompt: ${shot.videoPrompt}.` : "",
    shot.continuity ? `Continuity: ${shot.continuity}.` : "",
    shot.dialogue ? `Dialogue or lip-sync intent: ${shot.dialogue}.` : "",
    state.visualBible.negativePrompt ? `Avoid: ${state.visualBible.negativePrompt}.` : "",
  ].filter(Boolean).join("\n");
}
