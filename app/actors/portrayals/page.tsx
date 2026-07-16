"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ActorSummary = {
  id: string;
  name?: string;
  bio?: string;
};

type Portrayal = {
  id: string;
  actor_profile_id: string;
  character_id: string;
  project_id?: string | null;
  casting_assignment_id?: string | null;
  portrayal_name: string;
  visual_prompt: string;
  costume_direction: string;
  reference_image_url?: string | null;
  is_reusable: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type PortrayalForm = {
  id?: string;
  actor_profile_id: string;
  character_id: string;
  project_id: string;
  portrayal_name: string;
  visual_prompt: string;
  costume_direction: string;
  reference_image_url: string;
  is_reusable: boolean;
};

const EMPTY_FORM: PortrayalForm = {
  actor_profile_id: "",
  character_id: "",
  project_id: "",
  portrayal_name: "",
  visual_prompt: "",
  costume_direction: "",
  reference_image_url: "",
  is_reusable: true,
};

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
};

const headerStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto 18px",
};

const eyebrowStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#6de7df",
  fontSize: 13,
  fontWeight: 800,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(24px, 2vw, 34px)",
  fontWeight: 900,
};

const sectionStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
};

const noticeStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  color: "#f4f7f8",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "#f4f7f8",
  cursor: "pointer",
  fontSize: 13,
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  borderColor: "#6de7df",
  color: "#6de7df",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(0,0,0,0.4)",
  color: "#f4f7f8",
  fontSize: 13,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 12,
  color: "rgba(255,255,255,0.7)",
};

const thumbStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 8,
  objectFit: "cover",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
};

export default function PortrayalsPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <PortrayalsContent />
    </Suspense>
  );
}

function PortrayalsContent() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [portrayals, setPortrayals] = useState<Portrayal[]>([]);
  const [actors, setActors] = useState<ActorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PortrayalForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "角色演绎管理 | Kiikis";
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setSessionLoaded(true);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;
        setSession(data.session);
        setSessionLoaded(true);
      } catch {
        if (active) setSessionLoaded(true);
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/login");
    }
  }, [sessionLoaded, session, router]);

  const loadActors = useCallback(async (token: string) => {
    try {
      const response = await fetch("/api/actors", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const payload = await response.json();
      const list = Array.isArray(payload.actors) ? payload.actors : [];
      setActors(list.map((item: { id: string; name?: string; bio?: string }) => ({ id: item.id, name: item.name, bio: item.bio })));
    } catch {
      setActors([]);
    }
  }, []);

  const loadPortrayals = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/actors/portrayals", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "读取角色演绎列表失败。");
      }
      const payload = await response.json();
      setPortrayals(Array.isArray(payload.portrayals) ? payload.portrayals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取角色演绎列表失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadActors(session.access_token);
    void loadPortrayals(session.access_token);
  }, [session, loadActors, loadPortrayals]);

  const actorName = useCallback(
    (actorId: string) => actors.find((item) => item.id === actorId)?.name || actorId.slice(0, 8),
    [actors],
  );

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, actor_profile_id: actors[0]?.id || "" });
    setFormOpen(true);
  };

  const openEdit = (portrayal: Portrayal) => {
    setForm({
      id: portrayal.id,
      actor_profile_id: portrayal.actor_profile_id,
      character_id: portrayal.character_id,
      project_id: portrayal.project_id || "",
      portrayal_name: portrayal.portrayal_name || "",
      visual_prompt: portrayal.visual_prompt || "",
      costume_direction: portrayal.costume_direction || "",
      reference_image_url: portrayal.reference_image_url || "",
      is_reusable: portrayal.is_reusable !== false,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!session?.access_token) return;
    if (!form.actor_profile_id) {
      setError("请先选择演员。");
      return;
    }
    if (!form.character_id.trim()) {
      setError("请填写角色名。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: PortrayalForm & { id?: string } = { ...form };
      const method = form.id ? "PATCH" : "POST";
      const response = await fetch("/api/actors/portrayals", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "保存失败。");
      }
      setFormOpen(false);
      await loadPortrayals(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (portrayalId: string) => {
    if (!session?.access_token) return;
    if (!window.confirm("确定删除该角色演绎？")) return;
    setDeletingId(portrayalId);
    setError(null);
    try {
      const response = await fetch(`/api/actors/portrayals?id=${encodeURIComponent(portrayalId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "删除失败。");
      }
      await loadPortrayals(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    } finally {
      setDeletingId(null);
    }
  };

  const sortedPortrayals = useMemo(() => {
    return [...portrayals].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  }, [portrayals]);

  if (!sessionLoaded) {
    return <main style={shellStyle}>加载中...</main>;
  }
  if (!session) {
    return <main style={shellStyle}>请先登录，正在跳转...</main>;
  }

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Kiikis Production</p>
        <h1 style={titleStyle}>角色演绎管理</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          共 {portrayals.length} 条演绎 · 用于维护演员在具体角色下的视觉设定与服装方向
        </p>
      </header>
      <section style={sectionStyle}>
        <div style={{ ...cardStyle, display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={primaryButtonStyle} onClick={openCreate} disabled={actors.length === 0}>
            新建演绎
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void loadPortrayals(session.access_token)}
            disabled={loading}
          >
            刷新列表
          </button>
          {loading && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>加载中...</span>}
          {actors.length === 0 && (
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              尚未检测到演员档案，请先到 /actors 创建。
            </span>
          )}
        </div>

        {error && <div style={{ ...noticeStyle, color: "#ff8b8b", marginBottom: 16 }}>{error}</div>}

        {sortedPortrayals.length === 0 && !loading && !error && (
          <div style={noticeStyle}>暂无角色演绎记录。点击"新建演绎"开始。</div>
        )}

        {sortedPortrayals.map((portrayal) => (
          <div key={portrayal.id} style={cardStyle}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div
                style={{
                  ...thumbStyle,
                  backgroundImage: portrayal.reference_image_url ? `url(${portrayal.reference_image_url})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                aria-label="reference"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
                  <strong style={{ fontSize: 15 }}>{portrayal.portrayal_name || "（未命名演绎）"}</strong>
                  <span style={{ color: "#6de7df", fontSize: 12 }}>{portrayal.character_id}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                  演员：{actorName(portrayal.actor_profile_id)}
                  {portrayal.project_id ? ` · 项目：${portrayal.project_id}` : ""}
                </div>
                {portrayal.visual_prompt && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>
                    视觉提示：{portrayal.visual_prompt}
                  </div>
                )}
                {portrayal.costume_direction && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                    服装方向：{portrayal.costume_direction}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                  {portrayal.is_reusable ? "可复用" : "仅本次使用"}
                  {portrayal.updated_at ? ` · 更新于 ${new Date(portrayal.updated_at).toLocaleString()}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button type="button" style={buttonStyle} onClick={() => openEdit(portrayal)}>
                  编辑
                </button>
                <button
                  type="button"
                  style={{ ...buttonStyle, color: "#ff8b8b", borderColor: "rgba(255,139,139,0.4)" }}
                  onClick={() => void handleDelete(portrayal.id)}
                  disabled={deletingId === portrayal.id}
                >
                  {deletingId === portrayal.id ? "删除中..." : "删除"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {formOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 24,
          }}
          onClick={() => setFormOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              background: "#0c0d0d",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              padding: 24,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
              {form.id ? "编辑角色演绎" : "新建角色演绎"}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={labelStyle}>
                演员 *
                <select
                  style={inputStyle}
                  value={form.actor_profile_id}
                  onChange={(event) => setForm((current) => ({ ...current, actor_profile_id: event.target.value }))}
                >
                  <option value="">— 选择演员 —</option>
                  {actors.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.name || actor.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                角色名 *
                <input
                  style={inputStyle}
                  value={form.character_id}
                  onChange={(event) => setForm((current) => ({ ...current, character_id: event.target.value }))}
                  placeholder="例：林雨晴"
                />
              </label>
              <label style={labelStyle}>
                项目 ID
                <input
                  style={inputStyle}
                  value={form.project_id}
                  onChange={(event) => setForm((current) => ({ ...current, project_id: event.target.value }))}
                  placeholder="可选，关联到具体项目"
                />
              </label>
              <label style={labelStyle}>
                演绎名称
                <input
                  style={inputStyle}
                  value={form.portrayal_name}
                  onChange={(event) => setForm((current) => ({ ...current, portrayal_name: event.target.value }))}
                  placeholder="例：林雨晴·雨夜归来"
                />
              </label>
              <label style={labelStyle}>
                视觉提示 (visual_prompt)
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                  value={form.visual_prompt}
                  onChange={(event) => setForm((current) => ({ ...current, visual_prompt: event.target.value }))}
                  placeholder="描述这一演绎的视觉特征、气质、造型"
                />
              </label>
              <label style={labelStyle}>
                服装方向 (costume_direction)
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  value={form.costume_direction}
                  onChange={(event) => setForm((current) => ({ ...current, costume_direction: event.target.value }))}
                  placeholder="服装、配饰、化妆方向"
                />
              </label>
              <label style={labelStyle}>
                参考图 URL
                <input
                  style={inputStyle}
                  value={form.reference_image_url}
                  onChange={(event) => setForm((current) => ({ ...current, reference_image_url: event.target.value }))}
                  placeholder="https://..."
                />
              </label>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.is_reusable}
                  onChange={(event) => setForm((current) => ({ ...current, is_reusable: event.target.checked }))}
                />
                可在多个项目中复用
              </label>
            </div>
            {error && <div style={{ ...noticeStyle, color: "#ff8b8b", marginTop: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" style={buttonStyle} onClick={() => setFormOpen(false)} disabled={saving}>
                取消
              </button>
              <button type="button" style={primaryButtonStyle} onClick={() => void handleSubmit()} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
