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

export function artChatFallback(message: string) {
  const wantsImage = !/提示词|prompt|方案|文案|不要|先不|别|不需要|do not generate/i.test(message) && /(生成|画|生图|出图|改图|修改.*(图|照片)|generate|render|draw)/i.test(message);
  return { assistantText: wantsImage ? '将按你的明确要求生成图片候选；参考图会直接传给图片模型。' : '美术助理暂时不可用，输入已保留。请稍后重试。', actions: [], generation: wantsImage ? { prompt: message.slice(0, 8000), kind: /场景|环境|建筑/.test(message) ? 'scene' : /道具|物件/.test(message) ? 'prop' : 'character', name: '聊天生成' } : null };
}
