"use client";

import { useCallback, useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";

type AdminRow = { userId: string; email: string; role: "super_admin" | "operator" | "viewer"; createdAt: string };
type Role = "super_admin" | "operator" | "viewer";

export default function AdminAdminsPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ userId: string; role: Role }>({ userId: "", role: "viewer" });

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/admin/api/admins", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await res.json();
      setRows(payload.admins || []);
    } catch (e) { setError(e instanceof Error ? e.message : zh.common.error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const token = await getToken();
    const res = await fetch("/admin/api/admins", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: form.userId, role: form.role }),
    });
    if (res.ok) { setAddOpen(false); setForm({ userId: "", role: "viewer" }); await load(); }
    else { const j = await res.json(); setError(j.error || "FAILED"); }
  };

  const changeRole = async (userId: string, role: string) => {
    const token = await getToken();
    const res = await fetch(`/admin/api/admins/${userId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) await load();
  };

  const remove = async (userId: string) => {
    if (!confirm("确认移除该管理员？")) return;
    const token = await getToken();
    const res = await fetch(`/admin/api/admins/${userId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) await load();
  };

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.admins.title}</h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "0 0 16px" }}>{zh.admins.addAdmin}</p>

      <button onClick={() => setAddOpen(true)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>{zh.admins.addAdmin}</button>

      {error && <div style={{ color: "#ff8b8b", marginBottom: 12 }}>{error}</div>}

      {addOpen && (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>User ID</label>
            <input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13, width: 300 }} placeholder="从用户详情页复制 userId" />
          </div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.admins.colRole}</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
              <option value="viewer">{zh.role.viewer}</option>
              <option value="operator">{zh.role.operator}</option>
              <option value="super_admin">{zh.role.super_admin}</option>
            </select>
          </div>
          <button onClick={add} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.common.confirm}</button>
          <button onClick={() => setAddOpen(false)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 13 }}>{zh.common.cancel}</button>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.12)", textAlign: "left" }}>
            <th style={{ padding: "8px 10px" }}>{zh.admins.colEmail}</th>
            <th style={{ padding: "8px 10px" }}>{zh.admins.colRole}</th>
            <th style={{ padding: "8px 10px" }}>{zh.admins.colCreatedAt}</th>
            <th style={{ padding: "8px 10px" }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "8px 10px" }}>{r.email || r.userId.slice(0, 8)}</td>
              <td style={{ padding: "8px 10px" }}>
                <select value={r.role} onChange={(e) => changeRole(r.userId, e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 12 }}>
                  <option value="viewer">{zh.role.viewer}</option>
                  <option value="operator">{zh.role.operator}</option>
                  <option value="super_admin">{zh.role.super_admin}</option>
                </select>
              </td>
              <td style={{ padding: "8px 10px" }}>{new Date(r.createdAt).toLocaleString("zh-CN")}</td>
              <td style={{ padding: "8px 10px" }}>
                <button onClick={() => remove(r.userId)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 11 }}>移除</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && !loading && (
            <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>{zh.common.empty}</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
