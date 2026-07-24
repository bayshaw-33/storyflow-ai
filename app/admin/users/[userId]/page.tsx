"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { zh } from "@/lib/admin/zh";
import styles from "../../admin-shell.module.css";

type Detail = {
  userId: string;
  email: string;
  displayName: string | null;
  plan: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  balance: number | null;
  monthlyLimit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: "active" | "banned";
  bannedUntil: string | null;
  recentTasks: Array<{ id: string; step_key: string; status: string; created_at: string; completed_at: string | null }>;
} | null;

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = (params?.userId as string) || "";
  const [detail, setDetail] = useState<Detail>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlan, setEditPlan] = useState("free");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<null | "charge" | "deduct" | "reset" | "ban" | "unban">(null);
  const [modalInput, setModalInput] = useState("");
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
      const { data } = await client?.auth.getSession() ?? {};
      const token = data?.session?.access_token;
      if (!token) { setError(zh.common.unauthenticated); setLoading(false); return; }
      const res = await fetch(`/admin/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) { setError(`HTTP ${res.status}`); setLoading(false); return; }
      const payload = await res.json();
      setDetail(payload);
      setEditName(payload.displayName || "");
      setEditPlan(payload.plan || "free");
    } catch (e) {
      setError(e instanceof Error ? e.message : zh.common.error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`/admin/api/users/${userId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editName, plan: editPlan }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "FAILED"); }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : zh.common.error);
    } finally {
      setSaving(false);
    }
  };

  const runModalAction = async () => {
    setModalErr(null);
    try {
      const token = await getToken();
      let url = "";
      let body: Record<string, unknown> = {};
      if (modal === "charge") { url = `/admin/api/users/${userId}/credits`; body = { mode: "adjust", delta: Number(modalInput) }; }
      else if (modal === "deduct") {
        url = `/admin/api/users/${userId}/credits`; body = { mode: "adjust", delta: -Number(modalInput) };
        if (detail && detail.email !== modalInput) { setModalErr(`请输入用户邮箱 ${detail.email} 以确认`); return; }
      }
      else if (modal === "reset") { url = `/admin/api/users/${userId}/credits`; body = { mode: "reset" }; }
      else if (modal === "ban") { url = `/admin/api/users/${userId}/ban`; body = { duration: modalInput || "24h" }; }
      else if (modal === "unban") { url = `/admin/api/users/${userId}/unban`; }
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "FAILED"); }
      setModal(null); setModalInput("");
      await load();
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : zh.common.error);
    }
  };

  if (loading) return <main className={styles.loading}>{zh.common.loading}</main>;
  if (error) return <main><div style={{ color: "#ff8b8b" }}>{error}</div><button onClick={() => router.push("/admin/users")} style={{ marginTop: 12 }}>{zh.common.back}</button></main>;
  if (!detail) return <main>{zh.common.empty}</main>;

  return (
    <main>
      <button onClick={() => router.push("/admin/users")} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>← {zh.common.back}</button>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px" }}>{detail.email}</h1>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.basicInfo}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.users.detail.displayName}</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }} />
          </div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.users.detail.plan}</label>
            <select value={editPlan} onChange={(e) => setEditPlan(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13 }}>
              <option value="free">free</option>
              <option value="business">business</option>
            </select>
          </div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{zh.users.colSignedUp}</label><div>{detail.createdAt ? new Date(detail.createdAt).toLocaleString("zh-CN") : "—"}</div></div>
          <div><label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>最近登录</label><div>{detail.lastSignInAt ? new Date(detail.lastSignInAt).toLocaleString("zh-CN") : "—"}</div></div>
        </div>
        <button onClick={saveProfile} disabled={saving} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>
          {saving ? zh.common.loading : zh.common.save}
        </button>
      </section>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.creditsAccount}</h2>
        <div style={{ display: "flex", gap: 24, fontSize: 13, marginBottom: 12 }}>
          <div><span style={{ color: "rgba(255,255,255,0.6)" }}>{zh.users.detail.balance}: </span><strong style={{ color: "#6de7df" }}>{detail.balance ?? "—"}</strong></div>
          <div><span style={{ color: "rgba(255,255,255,0.6)" }}>{zh.users.detail.monthlyLimit}: </span>{detail.monthlyLimit ?? "—"}</div>
          <div><span style={{ color: "rgba(255,255,255,0.6)" }}>{zh.users.detail.period}: </span>{detail.periodStart ? new Date(detail.periodStart).toLocaleDateString("zh-CN") : "—"} ~ {detail.periodEnd ? new Date(detail.periodEnd).toLocaleDateString("zh-CN") : "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setModal("charge"); setModalInput(""); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.charge}</button>
          <button onClick={() => { setModal("deduct"); setModalInput(""); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.deduct}</button>
          <button onClick={() => { setModal("reset"); setModalInput(""); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.resetCredits}</button>
        </div>
      </section>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.accountStatus}</h2>
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          {detail.status === "banned" ? (
            <span style={{ color: "#ff8b8b" }}>{zh.users.statusBanned}（至 {detail.bannedUntil ? new Date(detail.bannedUntil).toLocaleString("zh-CN") : "—"}）</span>
          ) : (
            <span style={{ color: "#6de7df" }}>{zh.users.statusActive}</span>
          )}
        </div>
        {detail.status === "banned" ? (
          <button onClick={() => { setModal("unban"); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.unban}</button>
        ) : (
          <button onClick={() => { setModal("ban"); setModalInput("24h"); setModalErr(null); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 13 }}>{zh.users.detail.ban}</button>
        )}
      </section>

      <section style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{zh.users.detail.recentActivity}</h2>
        {detail.recentTasks.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{zh.common.empty}</div>
        ) : (
          <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {detail.recentTasks.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 12, color: "rgba(255,255,255,0.7)" }}>
                <span style={{ color: t.status === "completed" ? "#6de7df" : t.status === "failed" ? "#ff8b8b" : "rgba(255,255,255,0.6)" }}>{t.status}</span>
                <span>{t.step_key}</span>
                <span>{new Date(t.created_at).toLocaleString("zh-CN")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "#0c0d0d", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
              {modal === "charge" ? zh.users.detail.charge : modal === "deduct" ? zh.users.detail.deductConfirm : modal === "reset" ? zh.users.detail.resetCredits : modal === "ban" ? zh.users.detail.banConfirm : zh.users.detail.unban}
            </h3>
            {(modal === "charge" || modal === "deduct" || modal === "ban") && (
              <input
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                placeholder={modal === "ban" ? "24h / 7d / permanent" : "数量"}
                style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 13, marginBottom: 12 }}
              />
            )}
            {modal === "deduct" && <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, margin: "0 0 8px" }}>为确认，请输入用户邮箱 {detail.email}</p>}
            {modalErr && <div style={{ color: "#ff8b8b", fontSize: 12, marginBottom: 8 }}>{modalErr}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 13 }}>{zh.common.cancel}</button>
              <button onClick={runModalAction} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13 }}>{zh.common.confirm}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
