"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ChevronDown, User, Settings, LogOut } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { LetterAvatar } from "@/components/profile/LetterAvatar";
import styles from "./userMenu.module.css";

type UserMenuProfile = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type UserMenuProps = {
  session: Session | null;
  profile?: UserMenuProfile | null;
  onSignOut: () => void;
};

/**
 * TopNav 下拉菜单：头像（24px）+ 账号名 + 下拉箭头。
 * 展开后：我的主页 / 账号设置 / 退出登录。点击外部关闭。
 * 我的主页：有 username 跳 /u/[username]，未设跳 /settings/profile。
 */
export function UserMenu({ session, profile, onSignOut }: UserMenuProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const userId = session?.user.id ?? "";
  const displayName =
    profile?.display_name?.trim() ||
    (session?.user.user_metadata as Record<string, unknown> | undefined)?.display_name as string ||
    session?.user.email?.split("@")[0] ||
    (isZh ? "账号" : "Account");
  const avatarUrl = profile?.avatar_url || (session?.user.user_metadata as Record<string, unknown> | undefined)?.avatar_url as string;
  const profileHref = profile?.username ? `/u/${profile.username}` : "/settings/profile";

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.trigger}${open ? ` ${styles.triggerOpen}` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={displayName} />
          ) : (
            <LetterAvatar displayName={displayName} userId={userId} size={24} />
          )}
        </span>
        <span className={styles.name}>{displayName}</span>
        <ChevronDown size={14} className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ""}`} />
      </button>

      {open ? (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHint}>{isZh ? "我的" : "Account"}</div>
          <Link
            href={profileHref}
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <User size={14} />
            {isZh ? "我的主页" : "My profile"}
          </Link>
          <Link
            href="/settings/profile"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Settings size={14} />
            {isZh ? "账号设置" : "Settings"}
          </Link>
          <div className={styles.menuDivider} />
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut size={14} />
            {isZh ? "退出登录" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
