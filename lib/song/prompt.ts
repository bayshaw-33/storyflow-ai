/**
 * KIIKIS V2.2 歌曲派生摘要 — Phase 5 Task 5.2.
 * songDevelopmentNotes 降级为派生摘要：只用于旧项目一次性导入，不再回写为事实源。
 * 事实源 = Conversation Ledger（storyflow_conversation_messages）。
 */

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

/**
 * 从真实消息派生创作沟通摘要（用户最新意图可见、消息数可见）。
 * 摘要永远不写回为事实源。
 */
export function deriveDevelopmentSummary(messages: Array<{ role: string; content: string }>): string {
  if (!messages.length) {
    return "（暂无创作沟通记录）";
  }
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  const firstUser = userMessages[0];
  const parts = [`创作沟通摘要（${messages.length} 条消息，用户 ${userMessages.length} 条）：`];
  if (firstUser && firstUser !== lastUser) parts.push(`最初意图：${firstUser.content}`);
  if (lastUser) parts.push(`最新要求：${lastUser.content}`);
  return parts.join("\n");
}

/** 旧版 notes 一次性导入的内容标记；带此标记的消息不是实时事实。 */
export function isLegacyImportContent(content: string): boolean {
  return content.startsWith("【legacy_import】");
}

export function trimPromptBytes(value: string, maxBytes: number) {
  const encoder = new TextEncoder();
  const input = value.trim();
  if (encoder.encode(input).length <= maxBytes) return input;

  let output = "";
  let outputBytes = 0;
  for (const character of input) {
    const characterBytes = encoder.encode(character).length;
    if (outputBytes + characterBytes > maxBytes) break;
    output += character;
    outputBytes += characterBytes;
  }
  return output.trimEnd();
}
