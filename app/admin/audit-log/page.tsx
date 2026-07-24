"use client";

import { useCallback, useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";

type LogRow = {
  id: string; admin_user_id: string; adminEmail: string; action: string;
  target_user_id: string | null; target_ref: string | null;
  payload: unknown; created_at: string;
};

const ACTION_OPTIONS = [
  "user.profile.update", "user.credits.adjust", "user.ban", "user.unban",
  "ai_prompt.update", "ai_prompt.rollback", "ai_prompt.override.create", "ai_prompt.override.update", "ai_prompt.override.delete",
  "admin.role.add", "admin.role.update", "admin.role.remove",
];

export default function AdminAuditLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (action) params.set("action", action);
      const res = await fetch(`/admin/api/audit-log?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await res.json();
      setRows(payload.logs || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, action]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.auditLog.title}</h1>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
          <option value="">{zh.auditLog.filterAction}：全部</option>
          {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={() => void load()} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.common.refresh}</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.12)", textAlign: "left" }}>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colTime}</th>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colAdmin}</th>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colAction}</th>
            <th style={{ padding: "8px 10px" }}>{zh.auditLog.colTarget}</th>
            <th style={{ padding: "8px 10px" }}>payload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString("zh-CN")}</td>
              <td style={{ padding: "8px 10px" }}>{r.adminEmail || r.admin_user_id.slice(0, 8)}</td>
              <td style={{ padding: "8px 10px", color: "#6de7df" }}>{r.action}</td>
              <td style={{ padding: "8px 10px" }}>{r.target_ref || r.target_user_id?.slice(0, 8) || "—"}</td>
              <td style={{ padding: "8px 10px", maxWidth: 400, overflow: "auto", fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.6)" }}>
                {r.payload ? JSON.stringify(r.payload) : "—"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && !loading && (
            <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>{zh.common.empty}</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, marginTop: 12, fontSize: 13 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: page <= 1 ? "not-allowed" : "pointer" }}>上一页</button>
        <span style={{ color: "rgba(255,255,255,0.7)", padding: "4px 0" }}>{page}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={rows.length < 50} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: rows.length < 50 ? "not-allowed" : "pointer" }}>下一页</button>
      </div>
    </main>
  );
}
