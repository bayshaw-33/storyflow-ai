import { KiikisLogo } from "@/components/brand/KiikisLogo";
import Link from "next/link";

/**
 * /u/[username] 加载态：与 cosmic-page 保持视觉一致。
 */
export default function PublicProfileLoading() {
  return (
    <main className="cosmic-page profile-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>·</span>
        <h1 style={{ opacity: 0.55 }}>·</h1>
      </section>

      <div className="profile-page-body">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-12) 0",
            color: "var(--ink-muted)",
            fontSize: 14,
            gap: 10,
          }}
        >
          <span
            className="profile-loading-spinner"
            style={{
              width: 16,
              height: 16,
              border: "2px solid var(--glass-border)",
              borderTopColor: "var(--accent-cyan)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              display: "inline-block",
            }}
          />
          Loading creator profile…
        </div>
      </div>
    </main>
  );
}
