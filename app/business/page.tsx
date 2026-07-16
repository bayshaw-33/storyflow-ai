"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { listUniverses, createUniverseFromProject, type Universe } from "@/lib/universe";
import { readProjectsFromSupabase } from "@/lib/supabase/projects";
import type { DramaProject } from "@/lib/projects";

type TierKey = "personal" | "business" | "shared";

type TierConfig = {
  key: TierKey;
  title: string;
  description: string;
  accent: string;
};

const TIERS: TierConfig[] = [
  {
    key: "personal",
    title: "Personal · 个人层",
    description: "仅本人可见的 Universe。所有个人草稿、独立创作、未共享的角色 / 世界观默认存放于此。",
    accent: "#6de7df",
  },
  {
    key: "business",
    title: "Business · 商业层",
    description: "团队 / 工作室级 Universe，团队成员工享并协作。可包含商业项目 canon、组织 IP 资产。",
    accent: "#ffd166",
  },
  {
    key: "shared",
    title: "Shared · 共享层",
    description: "通过 universe_shares 被他人分享给你的 Universe。可按访问级别 (view / comment / edit) 协作。",
    accent: "#c084fc",
  },
];

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

export default function BusinessPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <BusinessContent />
    </Suspense>
  );
}

function BusinessContent() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", projectId: "" });

  useEffect(() => {
    document.title = "Business 管理 | Kiikis";
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

  const loadUniverses = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const [rows, cloudProjects] = await Promise.all([
        listUniverses({ accessToken: token }),
        readProjectsFromSupabase({ accessToken: token }).catch(() => [] as DramaProject[]),
      ]);
      setUniverses(rows);
      setProjects(cloudProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Universe 列表失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadUniverses(session.access_token);
  }, [session, loadUniverses]);

  const grouped = useMemo(() => {
    const map: Record<TierKey, Universe[]> = { personal: [], business: [], shared: [] };
    for (const universe of universes) {
      if (universe.team_id) {
        map.business.push(universe);
      } else {
        map.personal.push(universe);
      }
      // shared 层暂未通过 storyflow_universe_shares 拉取，留作占位说明。
    }
    return map;
  }, [universes]);

  const openCreate = () => {
    setForm({ name: "", description: "", projectId: projects[0]?.id || "" });
    setFormOpen(true);
  };

  const handleCreate = async () => {
    if (!session?.access_token) return;
    if (!form.name.trim()) {
      setError("请填写 Business Universe 名称。");
      return;
    }
    const project = projects.find((p) => p.id === form.projectId) || projects[0];
    if (!project) {
      setError("未找到可用的来源项目，请先创建一个项目后再创建 Business Universe。");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createUniverseFromProject({
        project,
        form: {
          name: form.name.trim(),
          description: form.description.trim(),
          genre: project.genre || "",
          default_language: project.targetLanguage || "English",
          target_markets: project.market ? [project.market] : [],
          tone: "",
        },
        teamId: null,
        accessToken: session.access_token,
      });
      setFormOpen(false);
      await loadUniverses(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建 Business Universe 失败。");
    } finally {
      setCreating(false);
    }
  };

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
        <h1 style={titleStyle}>Business 管理</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          三层 Universe 架构：Personal / Business / Shared · 共 {universes.length} 个 Universe
        </p>
      </header>
      <section style={sectionStyle}>
        <div style={{ ...cardStyle, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            style={primaryButtonStyle}
            onClick={openCreate}
            disabled={projects.length === 0}
          >
            创建 Business Universe
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void loadUniverses(session.access_token)}
            disabled={loading}
          >
            刷新列表
          </button>
          {loading && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>加载中...</span>}
          {projects.length === 0 && (
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              暂无可用来源项目，请先到工作台创建项目。
            </span>
          )}
        </div>

        {error && <div style={{ ...noticeStyle, color: "#ff8b8b", marginBottom: 16 }}>{error}</div>}

        {TIERS.map((tier) => {
          const list = grouped[tier.key];
          return (
            <div key={tier.key} style={{ ...cardStyle, borderColor: `${tier.accent}33` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                <h2 style={{ margin: 0, fontSize: 16, color: tier.accent }}>{tier.title}</h2>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{list.length} 个</span>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{tier.description}</p>
              {list.length === 0 ? (
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  暂无该层级的 Universe。
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {list.map((universe) => (
                    <div
                      key={universe.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                        <strong style={{ fontSize: 14 }}>{universe.name}</strong>
                        <span style={{ color: tier.accent, fontSize: 11 }}>
                          {universe.status === "active" ? "Active" : "Archived"}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 8px", fontSize: 12, color: "rgba(255,255,255,0.65)", minHeight: 32 }}>
                        {universe.description || "（暂无简介）"}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                        {universe.genre && <span>类型: {universe.genre}</span>}
                        {universe.default_language && <span>语言: {universe.default_language}</span>}
                        {universe.target_markets?.length > 0 && (
                          <span>市场: {universe.target_markets.join(", ")}</span>
                        )}
                        {universe.team_id && <span>team: {universe.team_id.slice(0, 8)}</span>}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                        更新于 {new Date(universe.updated_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>Shared 共享层补充说明</h2>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            storyflow_universe_shares 表存储了其他用户分享给你的 Universe（按 share_token + access_level 控制权限）。
            当前页面暂未拉取 shares 表数据；如需查看他人分享给你的 Universe，可到{" "}
            <a href="/universes" style={{ color: "#6de7df" }}>Universe 列表</a> 浏览全部可访问的 Universe。
          </p>
        </div>
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
              maxWidth: 520,
              background: "#0c0d0d",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              padding: 24,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>创建 Business Universe</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={labelStyle}>
                名称 *
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例：复仇千金 IP 商业宇宙"
                />
              </label>
              <label style={labelStyle}>
                简介
                <input
                  style={inputStyle}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="一句话描述"
                />
              </label>
              <label style={labelStyle}>
                来源项目
                <select
                  style={inputStyle}
                  value={form.projectId}
                  onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title || project.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <div style={{ ...noticeStyle, color: "#ff8b8b", marginTop: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" style={buttonStyle} onClick={() => setFormOpen(false)} disabled={creating}>
                取消
              </button>
              <button type="button" style={primaryButtonStyle} onClick={() => void handleCreate()} disabled={creating}>
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
