import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";

/**
 * /u/[username] 404：用户名不存在或主页已设为私密。
 * 文案对齐 i18n 兜底（中英文都展示），避免依赖客户端 useI18n（not-found 可在 SSR 抛出）。
 */
export default function PublicProfileNotFound() {
  return (
    <main
      className="cosmic-page profile-page"
      style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <header className="cosmic-page-header" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <div style={{ maxWidth: 460, textAlign: "center", padding: "0 20px" }}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: "var(--ink-muted)", marginBottom: 12 }}>
          KIIKIS
        </p>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            margin: "0 0 8px",
            color: "var(--ink-primary)",
            fontFamily: "var(--font-heading)",
          }}
        >
          This creator doesn't exist
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-secondary)", margin: "0 0 4px" }}>
          这个创作者不存在
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 24px" }}>
          The username doesn't exist, or the profile is set to private.
          <br />
          用户名不存在，或主页已设为私密。
        </p>
        <Link
          href="/community"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 38,
            padding: "0 18px",
            borderRadius: 6,
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-fg)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          ← Back to community
        </Link>
      </div>
    </main>
  );
}
