export function hasCompletedVersionReview(
  messages: Array<{ role: string; content: string }>,
  prefix: string,
  versionId: string | null,
): boolean {
  if (!versionId) return false;
  const marker = `${prefix}（大纲版本：${versionId}）`;
  return messages.some((message, index) => message.role === "user" && message.content.startsWith(marker)
    && messages[index + 1]?.role === "assistant" && Boolean(messages[index + 1]?.content.trim()));
}
