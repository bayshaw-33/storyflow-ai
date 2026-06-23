"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

type AdminUserRow = {
  userId: string;
  email: string;
  createdAt: string | null;
  displayName: string | null;
  plan: string | null;
  balance: number | null;
  monthlyLimit: number | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AdminUserRow[] };

export default function AdminPage() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (active) setState({ status: "unauthorized" });
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (active) setState({ status: "unauthorized" });
        return;
      }

      const response = await fetch("/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        if (active) setState({ status: "unauthorized" });
        return;
      }
      if (!response.ok) {
        if (active) setState({ status: "error", message: `HTTP ${response.status}` });
        return;
      }

      const payload = (await response.json()) as { users: AdminUserRow[] };
      if (active) setState({ status: "ready", rows: payload.users || [] });
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="kiikis-site">
      <section className="kiikis-dashboard-shell kiikis-dashboard-single">
        <div className="dashboard-main">
          <header className="dashboard-welcome">
            <div>
              <span>{t("admin.title")}</span>
              <h2>{t("admin.users.title")}</h2>
              <p>{t("admin.users.body")}</p>
            </div>
          </header>

          <div className="dashboard-panel">
            {state.status === "loading" ? (
              <p className="subtle">{t("admin.loading")}</p>
            ) : null}

            {state.status === "unauthorized" ? (
              <div className="notice error">
                {t("admin.unauthorized")}
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className="notice error">
                {t("admin.loadFailed") + state.message}
              </div>
            ) : null}

            {state.status === "ready" ? (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-user-table">
                  <thead>
                    <tr>
                      <th>{t("admin.col.email")}</th>
                      <th>{t("admin.col.name")}</th>
                      <th>{t("admin.col.signedUp")}</th>
                      <th>{t("admin.col.plan")}</th>
                      <th>{t("admin.col.credits")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.email}</td>
                        <td>{row.displayName || "—"}</td>
                        <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                        <td>{row.plan || "—"}</td>
                        <td>
                          {row.balance === null
                            ? "—"
                            : `${row.balance}${row.monthlyLimit !== null ? ` / ${row.monthlyLimit}` : ""}`}
                        </td>
                      </tr>
                    ))}
                    {state.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="subtle">{t("admin.empty")}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
