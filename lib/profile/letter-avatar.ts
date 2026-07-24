/**
 * 字母头像（社区系统阶段 A）。
 *
 * 设计文档 §7：display_name 首字母 + user_id 哈希决定渐变色。
 * 前端纯计算，无网络请求。
 */

const GRADIENTS: string[] = [
  "linear-gradient(135deg, #00d4ff, #0066ff)", // cyan / blue
  "linear-gradient(135deg, #ff6b6b, #ff8c00)", // red / orange
  "linear-gradient(135deg, #a78bfa, #ec4899)", // purple / pink
  "linear-gradient(135deg, #10b981, #14b8a6)", // green / teal
  "linear-gradient(135deg, #6366f1, #8b5cf6)", // indigo / violet
  "linear-gradient(135deg, #f59e0b, #facc15)", // amber / yellow
  "linear-gradient(135deg, #f43f5e, #e11d48)", // rose / red
  "linear-gradient(135deg, #64748b, #27272a)", // slate / zinc
];

/**
 * 简单字符串哈希（32-bit 整数，非加密用途）。
 * 用于将 user_id 映射到稳定的渐变色索引。
 */
export function simpleHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0; // 强制转 32-bit
  }
  return Math.abs(hash);
}

export type LetterAvatar = { letter: string; gradient: string };

export function getLetterAvatar(
  displayName: string,
  userId: string,
): LetterAvatar {
  const trimmed = (displayName || "").trim();
  const letter = trimmed.charAt(0).toUpperCase() || "?";
  const hash = simpleHash(userId || "");
  return { letter, gradient: GRADIENTS[hash % GRADIENTS.length] };
}

export const LETTER_AVATAR_GRADIENTS = GRADIENTS;
