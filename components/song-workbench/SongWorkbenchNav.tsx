"use client";

import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

export type SongWorkbenchSection = "create" | "library" | "voices" | "toolkit";

type Props = {
  active: SongWorkbenchSection;
  onAccountClick?: () => void;
};

export function SongWorkbenchNav({ active, onAccountClick }: Props) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const account = (
    <span className="song-reference-account-content">
      <span className="song-reference-avatar">K</span>
      <span>KIIKIS</span>
      <ChevronDown size={14} />
    </span>
  );

  return (
    <header className="song-reference-topbar">
      <Link className="song-reference-brand" href="/song-workbench">KIIKIS AI 音乐工作台</Link>
      <nav className="song-reference-nav" aria-label={isZh ? "音乐工作台导航" : "Music workbench navigation"}>
        <Link className={active === "create" ? "active" : ""} href="/song-workbench">{isZh ? "创作" : "Create"}</Link>
        <Link className={active === "library" ? "active" : ""} href="/song-library">{isZh ? "我的作品" : "My works"}</Link>
        <Link className={active === "voices" ? "active" : ""} href="/song-voices">{isZh ? "音色库" : "Voices"}</Link>
        <Link className={active === "toolkit" ? "active" : ""} href="/song-toolkit">{isZh ? "工具箱" : "Toolkit"}</Link>
      </nav>
      <div className="song-reference-account">
        <button className="song-reference-icon-button" type="button" aria-label={isZh ? "搜索" : "Search"} title={isZh ? "搜索" : "Search"}>
          <Search size={19} />
        </button>
        {onAccountClick ? (
          <button className="song-reference-account-button" type="button" onClick={onAccountClick} aria-label={isZh ? "打开账号菜单" : "Open account menu"}>{account}</button>
        ) : (
          <Link className="song-reference-account-link" href="/settings/profile" aria-label={isZh ? "打开账号设置" : "Open account settings"}>{account}</Link>
        )}
      </div>
    </header>
  );
}
