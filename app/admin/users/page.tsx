"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { zh } from "@/lib/admin/zh";
import styles from "../admin-shell.module.css";

type UserRow = {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: string | null;
  plan: string;
  balance: number | null;
  monthlyLimit: number | null;
  status: "active" | "banned";
};

type ListResp = {
  users: UserRow[];
  page: number;
  pageSize: number;
  total: number;
} | { error: string };

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
      const { data } = await client?.auth.getSession() ?? {};
      const token = data?.session?.access_token;
      if (!token) { setError(zh.common.unauthenticated); setLoading(false); return; }
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      if (plan) params.set("plan", plan);
      if (status) params.set("status", status);
      const res = await fetch(`/admin/api/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await res.json()) as ListResp;
      if ("error" in payload) { setError(payload.error); setRows([]); setTotal(0); }
      else { setRows(payload.users); setTotal(payload.total); }
    } catch (e) {
      setError(e instanceof Error ? e.message : zh.common.error);
    } finally {
      setLoading(false);
    }
  }, [page, q, plan, status]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.users.title}</h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "0 0 16px" }}>{zh.users.listBody}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder={zh.common.search}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13, width: 200 }}
        />
        <select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
          <option value="">{zh.users.filterPlan}：全部</option>
          <option value="free">free</option>
          <option value="business">business</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
          <option value="">{zh.users.filterStatus}：全部</option>
          <option value="active">{zh.users.statusActive}</option>
          <option value="banned">{zh.users.statusBanned}</option>
        </select>
        <button onClick={() => void load()} disabled={loading} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>
          {zh.common.refresh}
        </button>
      </div>

      {error && <div style={{ color: "#ff8b8b", marginBottom: 12 }}>{error}</div>}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.12)", textAlign: "left" }}>
              <th style={{ padding: "8px 10px" }}>{zh.users.colEmail}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colName}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colSignedUp}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colPlan}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colCredits}</th>
              <th style={{ padding: "8px 10px" }}>{zh.users.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "8px 10px" }}>
                  <Link href={`/admin/users/${r.userId}`} style={{ color: "#6de7df" }}>{r.email}</Link>
                </td>
                <td style={{ padding: "8px 10px" }}>{r.displayName || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN") : "—"}</td>
                <td style={{ padding: "8px 10px" }}>{r.plan}</td>
                <td style={{ padding: "8px 10px" }}>{r.balance === null ? "—" : `${r.balance}${r.monthlyLimit !== null ? ` / ${r.monthlyLimit}` : ""}`}</td>
                <td style={{ padding: "8px 10px" }}>
                  {r.status === "banned" ? (
                    <span style={{ color: "#ff8b8b" }}>{zh.users.statusBanned}</span>
                  ) : (
                    <span style={{ color: "#6de7df" }}>{zh.users.statusActive}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>{zh.common.empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, fontSize: 13 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: page <= 1 ? "not-allowed" : "pointer" }}>上一页</button>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>{page} / {totalPages}（共 {total}）</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: page >= totalPages ? "not-allowed" : "pointer" }}>下一页</button>
      </div>
    </main>
  );
}
