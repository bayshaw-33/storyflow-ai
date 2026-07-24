"use client";

import type { CSSProperties } from "react";
import { getLetterAvatar } from "@/lib/profile/letter-avatar";
import styles from "./profile.module.css";

type LetterAvatarProps = {
  displayName: string;
  userId: string;
  /** 像素尺寸，默认 40。 */
  size?: number;
  className?: string;
};

/**
 * 字母头像：用户未上传头像时的 fallback。
 * 渐变与字母由 lib/profile/letter-avatar 的 getLetterAvatar 纯前端计算，
 * 同一 user_id 永远得到同一渐变，保证视觉稳定。
 */
export function LetterAvatar({ displayName, userId, size = 40, className }: LetterAvatarProps) {
  const { letter, gradient } = getLetterAvatar(displayName, userId);
  const style: CSSProperties = {
    width: size,
    height: size,
    background: gradient,
    fontSize: Math.max(12, Math.round(size * 0.42)),
  };
  return (
    <div
      className={`${styles.letterAvatar}${className ? ` ${className}` : ""}`}
      style={style}
      role="img"
      aria-label={displayName || "avatar"}
    >
      <span>{letter}</span>
    </div>
  );
}
