"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { zh } from "@/lib/admin/zh";
import type { AdminRole } from "@/lib/admin/roles";
import styles from "./admin-shell.module.css";

type MeResponse = { userId: string; email: string; role: AdminRole } | { error: string };

const ROLE_RANK: Record<AdminRole, number> = { viewer: 1, operator: 2, super_admin: 3 };

type NavItem = { href: string; label: string; minRole: AdminRole; comingSoon?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: zh.nav.overview, minRole: "viewer" },
  { href: "/admin/users", label: zh.nav.users, minRole: "viewer" },
  { href: "/admin/ai-prompts", label: zh.nav.aiPrompts, minRole: "viewer" },
  { href: "/admin/admins", label: zh.nav.admins, minRole: "super_admin" },
  { href: "/admin/audit-log", label: zh.nav.auditLog, minRole: "super_admin" },
  { href: "/admin/content", label: "内容审核", minRole: "viewer", comingSoon: true },
  { href: "/admin/monitor", label: "系统监控", minRole: "viewer", comingSoon: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
        if (!client) {
          if (active) setMe({ error: "UNAUTHENTICATED" });
          return;
        }
        const { data } = await client.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (active) setMe({ error: "UNAUTHENTICATED" });
          return;
        }
        const res = await fetch("/admin/api/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (res.status === 401 || res.status === 403) {
          setMe({ error: res.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" });
          return;
        }
        const payload = await res.json();
        setMe(payload);
      } catch {
        if (active) setMe({ error: "NETWORK_ERROR" });
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (me && "error" in me) {
      if (me.error === "UNAUTHENTICATED") router.push("/login");
    }
  }, [me, router]);

  if (!me) {
    return <main className={styles.loading}>{zh.common.loading}</main>;
  }
  if ("error" in me) {
    if (me.error === "UNAUTHENTICATED") {
      return <main className={styles.loading}>{zh.common.unauthenticated}</main>;
    }
    return (
      <main className={styles.loading}>
        <div className={styles.notice}>
          {me.error === "FORBIDDEN" ? zh.common.unauthorized : zh.common.error}
        </div>
      </main>
    );
  }

  const role = me.role;
  const roleBadgeClass =
    role === "super_admin" ? styles.roleBadgeSuper
    : role === "operator" ? styles.roleBadgeOperator
    : styles.roleBadgeViewer;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>{zh.brand}</div>
        {NAV_ITEMS.map((item) => {
          if (item.comingSoon) {
            return (
              <span key={item.href} className={styles.navDisabled} title="即将上线">
                {item.label} · 即将上线
              </span>
            );
          }
          if (ROLE_RANK[role] < ROLE_RANK[item.minRole]) return null;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>
      <div className={styles.main}>
        <div className={styles.topbar}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>{me.email}</span>
          <span className={`${styles.roleBadge} ${roleBadgeClass}`}>{zh.role[role]}</span>
          <button
            type="button"
            onClick={async () => {
              const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
              if (client) await client.auth.signOut();
              router.push("/login");
            }}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "#f4f7f8", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
          >
            {zh.nav.logout}
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
