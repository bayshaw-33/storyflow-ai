"use client";

import { useCallback, useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";

type PromptRow = { key: string; category: "rules" | "task"; label: string; body: string; updated_at: string };
type VersionRow = { id: string; body: string; updated_by: string | null; created_at: string };
type OverrideRow = {
  id: string; scope: "global" | "task_type"; target: string;
  injection_text: string; position: "prepend" | "append"; enabled: boolean; updated_at: string;
};

type Tab = "rules" | "tasks" | "overrides";

const TASK_GROUPS: Record<string, string[]> = {
  "剧本工作台": ["market_analysis","script_import","brief","characters","structure_model","beat_cards","series_outline","existing_script","chinese_script","continuation_script","translation","localization","test_script","quality_evaluation","final_script","format_check","storyboard_script","final_delivery"],
  "小说工作台": ["novel_development_chat","novel_brief","novel_bible","novel_characters","novel_volume_outline","novel_chapter_outline","novel_chapter_draft","novel_revision","novel_export"],
  "歌曲工作台": ["song_workbench","song_development_chat"],
  "创作工作台": ["creation_development_chat","creation_background_world","creation_character_bible","creation_plot_outline","creation_novel_unit","creation_screenplay_unit","creation_episode_plan","creation_translate_unit","creation_localize_unit"],
  "爆款工作台": ["viral_video_analysis","viral_structure_remake","viral_export_package"],
};

export default function AdminAiPromptsPage() {
  const [tab, setTab] = useState<Tab>("rules");
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [search, setSearch] = useState("");

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const [pRes, oRes] = await Promise.all([
        fetch("/admin/api/ai-prompts", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/admin/api/ai-prompts/overrides", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      const p = await pRes.json(); const o = await oRes.json();
      setPrompts(p.prompts || []);
      setOverrides(o.overrides || []);
    } catch (e) { setError(e instanceof Error ? e.message : zh.common.error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  const selectPrompt = async (key: string) => {
    setSelectedKey(key);
    setShowVersions(false);
    const token = await getToken();
    const res = await fetch(`/admin/api/ai-prompts/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    const payload = await res.json();
    setEditBody(payload.prompt?.body || "");
    setVersions(payload.versions || []);
  };

  const save = async () => {
    if (!selectedKey) return;
    if (!confirm(zh.aiPrompts.saveConfirm)) return;
    setSaving(true); setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/admin/api/ai-prompts/${encodeURIComponent(selectedKey)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "FAILED"); }
      await selectPrompt(selectedKey);
      await loadList();
    } catch (e) { setError(e instanceof Error ? e.message : zh.common.error); }
    finally { setSaving(false); }
  };

  const rollback = async (versionId: string) => {
    if (!selectedKey) return;
    if (!confirm("确认回滚到此版本？")) return;
    const token = await getToken();
    const res = await fetch(`/admin/api/ai-prompts/${encodeURIComponent(selectedKey)}/rollback`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (res.ok) { await selectPrompt(selectedKey); await loadList(); }
  };

  const filteredPrompts = prompts.filter((p) => {
    if (tab === "rules" && p.category !== "rules") return false;
    if (tab === "tasks" && p.category !== "task") return false;
    if (tab === "overrides") return false;
    if (search) return p.label.includes(search) || p.key.includes(search);
    return true;
  });

  const selectedPrompt = prompts.find((p) => p.key === selectedKey);

  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{zh.aiPrompts.title}</h1>
      <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,139,139,0.1)", border: "1px solid rgba(255,139,139,0.3)", color: "#ff8b8b", fontSize: 12, marginBottom: 16 }}>
        ⚠ {zh.aiPrompts.warning}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {(["rules","tasks","overrides"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", background: tab === t ? "rgba(109,231,223,0.1)" : "transparent",
            border: "none", borderBottom: tab === t ? "2px solid #6de7df" : "2px solid transparent",
            color: tab === t ? "#6de7df" : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13,
          }}>
            {t === "rules" ? zh.aiPrompts.tabRules : t === "tasks" ? zh.aiPrompts.tabTasks : zh.aiPrompts.tabOverrides}
          </button>
        ))}
      </div>

      {error && <div style={{ color: "#ff8b8b", marginBottom: 12 }}>{error}</div>}

      {tab === "overrides" ? (
        <OverridesPanel overrides={overrides} onChange={loadList} />
      ) : (
        <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
          <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 12 }}>
            <input placeholder={zh.common.search} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontSize: 12, marginBottom: 8 }} />
            {tab === "tasks" ? (
              Object.entries(TASK_GROUPS).map(([group, keys]) => {
                const groupRows = filteredPrompts.filter((p) => keys.includes(p.key.replace("task:", "")));
                if (groupRows.length === 0) return null;
                return (
                  <div key={group} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "4px 8px" }}>{group}</div>
                    {groupRows.map((p) => (
                      <button key={p.key} onClick={() => selectPrompt(p.key)} style={{
                        display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
                        background: selectedKey === p.key ? "rgba(109,231,223,0.12)" : "transparent",
                        border: "none", color: selectedKey === p.key ? "#6de7df" : "rgba(255,255,255,0.75)",
                        cursor: "pointer", fontSize: 12, borderRadius: 4,
                      }}>{p.label}</button>
                    ))}
                  </div>
                );
              })
            ) : (
              filteredPrompts.map((p) => (
                <button key={p.key} onClick={() => selectPrompt(p.key)} style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                  background: selectedKey === p.key ? "rgba(109,231,223,0.12)" : "transparent",
                  border: "none", color: selectedKey === p.key ? "#6de7df" : "rgba(255,255,255,0.75)",
                  cursor: "pointer", fontSize: 13, borderRadius: 4,
                }}>{p.label}</button>
              ))
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedKey ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{selectedPrompt?.label}</strong>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginLeft: 8 }}>{selectedKey}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowVersions((v) => !v)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 12 }}>{zh.aiPrompts.versionHistory}</button>
                    <button onClick={save} disabled={saving} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 12 }}>{saving ? zh.common.loading : zh.aiPrompts.save}</button>
                  </div>
                </div>
                {showVersions && (
                  <div style={{ marginBottom: 12, padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.03)", maxHeight: 200, overflow: "auto" }}>
                    {versions.length === 0 ? <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{zh.common.empty}</div> : versions.map((v) => (
                      <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11 }}>
                        <span style={{ color: "rgba(255,255,255,0.6)" }}>{new Date(v.created_at).toLocaleString("zh-CN")}</span>
                        <button onClick={() => rollback(v.id)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 11 }}>{zh.aiPrompts.rollback}</button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  style={{ width: "100%", minHeight: 400, padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.6, boxSizing: "border-box" }}
                />
              </>
            ) : (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, padding: 24 }}>请从左侧选择一项</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function OverridesPanel({ overrides, onChange }: { overrides: OverrideRow[]; onChange: () => void }) {
  const [editing, setEditing] = useState<OverrideRow | null>(null);
  const [newOverride, setNewOverride] = useState(false);
  const [form, setForm] = useState({ scope: "global", target: "*", injectionText: "", position: "prepend", enabled: true });

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data } = await client?.auth.getSession() ?? {};
    return data?.session?.access_token || "";
  };

  const save = async () => {
    const token = await getToken();
    if (editing) {
      await fetch(`/admin/api/ai-prompts/overrides/${editing.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/admin/api/ai-prompts/overrides", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setEditing(null); setNewOverride(false);
    setForm({ scope: "global", target: "*", injectionText: "", position: "prepend", enabled: true });
    onChange();
  };

  const toggle = async (o: OverrideRow) => {
    const token = await getToken();
    await fetch(`/admin/api/ai-prompts/overrides/${o.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !o.enabled }),
    });
    onChange();
  };

  const del = async (o: OverrideRow) => {
    if (!confirm("确认删除此注入？")) return;
    const token = await getToken();
    await fetch(`/admin/api/ai-prompts/overrides/${o.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    onChange();
  };

  return (
    <div>
      <button onClick={() => { setNewOverride(true); setEditing(null); setForm({ scope: "global", target: "*", injectionText: "", position: "prepend", enabled: true }); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>{zh.aiPrompts.newOverride}</button>

      {(newOverride || editing) && (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8, fontSize: 12 }}>
            <div><label style={{ color: "rgba(255,255,255,0.6)" }}>{zh.aiPrompts.overrideScope}</label>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, target: e.target.value === "global" ? "*" : "" })} style={{ width: "100%", padding: "4px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8" }}>
                <option value="global">{zh.aiPrompts.scopeGlobal}</option>
                <option value="task_type">{zh.aiPrompts.scopeTaskType}</option>
              </select>
            </div>
            <div><label style={{ color: "rgba(255,255,255,0.6)" }}>target</label>
              <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} disabled={form.scope === "global"} style={{ width: "100%", padding: "4px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8" }} />
            </div>
            <div><label style={{ color: "rgba(255,255,255,0.6)" }}>{zh.aiPrompts.position}</label>
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} style={{ width: "100%", padding: "4px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8" }}>
                <option value="prepend">{zh.aiPrompts.positionPrepend}</option>
                <option value="append">{zh.aiPrompts.positionAppend}</option>
              </select>
            </div>
          </div>
          <textarea value={form.injectionText} onChange={(e) => setForm({ ...form, injectionText: e.target.value })} placeholder={zh.aiPrompts.injectionText} style={{ width: "100%", minHeight: 80, padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.4)", color: "#f4f7f8", fontFamily: "ui-monospace, monospace", fontSize: 12, boxSizing: "border-box", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(109,231,223,0.4)", background: "transparent", color: "#6de7df", cursor: "pointer", fontSize: 12 }}>{zh.common.save}</button>
            <button onClick={() => { setNewOverride(false); setEditing(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 12 }}>{zh.common.cancel}</button>
          </div>
        </div>
      )}

      {overrides.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{zh.common.empty}</div>
      ) : overrides.map((o) => (
        <div key={o.id} style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <span style={{ color: o.enabled ? "#6de7df" : "rgba(255,255,255,0.4)" }}>{o.scope === "global" ? zh.aiPrompts.scopeGlobal : `${zh.aiPrompts.scopeTaskType}: ${o.target}`}</span>
              <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{o.position === "prepend" ? zh.aiPrompts.positionPrepend : zh.aiPrompts.positionAppend}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => toggle(o)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 11 }}>{o.enabled ? "禁用" : zh.aiPrompts.enabled}</button>
              <button onClick={() => { setEditing(o); setNewOverride(false); setForm({ scope: o.scope, target: o.target, injectionText: o.injection_text, position: o.position, enabled: o.enabled }); }} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#f4f7f8", cursor: "pointer", fontSize: 11 }}>编辑</button>
              <button onClick={() => del(o)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,139,139,0.4)", background: "transparent", color: "#ff8b8b", cursor: "pointer", fontSize: 11 }}>删除</button>
            </div>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.7)", fontFamily: "ui-monospace, monospace" }}>{o.injection_text}</pre>
        </div>
      ))}
    </div>
  );
}
