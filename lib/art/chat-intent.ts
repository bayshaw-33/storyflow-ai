export function normalizeArtGeneration(value: unknown, assets: Array<{ id: string }>) {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Record<string, unknown>;
  if (typeof plan.prompt !== 'string' || !plan.prompt.trim()) return null;
  return {
    prompt: plan.prompt.trim().slice(0, 8000),
    assetId: typeof plan.assetId === 'string' && assets.some(asset => asset.id === plan.assetId) ? plan.assetId : undefined,
    kind: plan.kind === 'scene' || plan.kind === 'prop' ? plan.kind : 'character' as const,
    name: typeof plan.name === 'string' && plan.name.trim() ? plan.name.trim().slice(0, 100) : '聊天生成',
  };
}

export function buildArtGenerationPrompt(userMessage: string, plannedPrompt: string, referenceCount: number) {
  const exact = userMessage.trim().slice(0, 4800);
  const planned = plannedPrompt.trim().slice(0, 2400);
  const sections = [`【用户本轮原始要求（必须严格执行）】\n${exact}`];
  if (planned && planned !== exact) sections.push(`【视觉执行细化】\n${planned}`);
  if (referenceCount > 0) {
    sections.push(`【参考图约束】\n请求中附带 ${referenceCount} 张参考图。必须将这些图片作为人物身份、服装、主体、构图或风格的视觉依据，按用户要求决定保留项，不得忽略或用无关内容替代。`);
  }
  return sections.join('\n\n').slice(0, 8000);
}

export function artChatFallback(message: string) {
  const wantsImage = !/提示词|prompt|方案|文案|不要|先不|别|不需要|do not generate/i.test(message) && /(生成|画|生图|出图|改图|修改.*(图|照片)|generate|render|draw)/i.test(message);
  return { assistantText: wantsImage ? '将按你的明确要求生成图片候选；参考图会直接传给图片模型。' : '美术助理暂时不可用，输入已保留。请稍后重试。', actions: [], generation: wantsImage ? { prompt: message.slice(0, 8000), kind: /场景|环境|建筑/.test(message) ? 'scene' : /道具|物件/.test(message) ? 'prop' : 'character', name: '聊天生成' } : null };
}
