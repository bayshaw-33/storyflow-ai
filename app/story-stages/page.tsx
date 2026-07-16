"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type StoryStage = {
  id: string;
  project_id: string;
  season_id?: string | null;
  name: string;
  stage_type: "setup" | "rising_action" | "climax" | "falling_action" | "resolution";
  sort_order: number;
  episode_ids: string[];
  workflow_status: "planning" | "drafting" | "in_review" | "completed" | "archived";
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type StageForm = {
  id?: string;
  project_id: string;
  name: string;
  stage_type: StoryStage["stage_type"];
  workflow_status: StoryStage["workflow_status"];
  episode_ids: string;
  sort_order: number;
};

const STAGE_TYPES: StoryStage["stage_type"][] = [
  "setup",
  "rising_action",
  "climax",
  "falling_action",
  "resolution",
];

const STAGE_LABEL: Record<StoryStage["stage_type"], string> = {
  setup: "开端 (Setup)",
  rising_action: "上升动作 (Rising Action)",
  climax: "高潮 (Climax)",
  falling_action: "下降动作 (Falling Action)",
  resolution: "结局 (Resolution)",
};

const STAGE_COLOR: Record<StoryStage["stage_type"], string> = {
  setup: "#6de7df",
  rising_action: "#ffd166",
  climax: "#ff8b8b",
  falling_action: "#c084fc",
  resolution: "#7dd181",
};

const STATUS_LABEL: Record<StoryStage["workflow_status"], string> = {
  planning: "规划中",
  drafting: "起草中",
  in_review: "审阅中",
  completed: "已完成",
  archived: "已归档",
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

export default function StoryStagesPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <StoryStagesContent />
    </Suspense>
  );
}

function StoryStagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "draft";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [stages, setStages] = useState<StoryStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<StageForm>(createEmptyForm(projectId));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "叙事弧线 | Kiikis";
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

  const loadStages = useCallback(
    async (token: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/story-stages?projectId=${encodeURIComponent(projectId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "读取叙事弧线失败。");
        }
        const payload = await response.json();
        setStages(Array.isArray(payload.stages) ? payload.stages : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "读取叙事弧线失败。");
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!session?.access_token) return;
    void loadStages(session.access_token);
  }, [session, loadStages]);

  const sortedStages = useMemo(() => {
    const order: Record<StoryStage["stage_type"], number> = {
      setup: 0,
      rising_action: 1,
      climax: 2,
      falling_action: 3,
      resolution: 4,
    };
    return [...stages].sort((a, b) => {
      const typeDelta = order[a.stage_type] - order[b.stage_type];
      if (typeDelta !== 0) return typeDelta;
      return a.sort_order - b.sort_order;
    });
  }, [stages]);

  const openCreate = () => {
    setForm(createEmptyForm(projectId));
    setFormOpen(true);
  };

  const openEdit = (stage: StoryStage) => {
    setForm({
      id: stage.id,
      project_id: stage.project_id,
      name: stage.name,
      stage_type: stage.stage_type,
      workflow_status: stage.workflow_status,
      episode_ids: Array.isArray(stage.episode_ids) ? stage.episode_ids.join(", ") : "",
      sort_order: stage.sort_order,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!session?.access_token) return;
    if (!form.name.trim()) {
      setError("请填写阶段名称。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const episodeIds = form.episode_ids
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = {
        id: form.id,
        project_id: form.project_id,
        name: form.name.trim(),
        stage_type: form.stage_type,
        workflow_status: form.workflow_status,
        episode_ids: episodeIds,
        sort_order: form.sort_order,
      };
      const method = form.id ? "PATCH" : "POST";
      const response = await fetch("/api/story-stages", {
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
      await loadStages(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stageId: string) => {
    if (!session?.access_token) return;
    if (!window.confirm("确定删除该叙事阶段？")) return;
    setDeletingId(stageId);
    setError(null);
    try {
      const response = await fetch(`/api/story-stages?id=${encodeURIComponent(stageId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "删除失败。");
      }
      await loadStages(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    } finally {
      setDeletingId(null);
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
        <h1 style={titleStyle}>叙事弧线 · Story Stages</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          项目 ID：{projectId} · 共 {stages.length} 个阶段
        </p>
      </header>
      <section style={sectionStyle}>
        <div style={{ ...cardStyle, display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={primaryButtonStyle} onClick={openCreate}>
            新建阶段
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void loadStages(session.access_token)}
            disabled={loading}
          >
            刷新
          </button>
          {loading && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>加载中...</span>}
        </div>

        {error && <div style={{ ...noticeStyle, color: "#ff8b8b", marginBottom: 16 }}>{error}</div>}

        {sortedStages.length === 0 && !loading && !error && (
          <div style={noticeStyle}>
            暂无叙事阶段。点击"新建阶段"，按 setup / rising_action / climax / falling_action / resolution 五段式搭建叙事弧线。
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedStages.map((stage) => (
            <div key={stage.id} style={{ ...cardStyle, marginBottom: 0, borderColor: `${STAGE_COLOR[stage.stage_type]}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: `${STAGE_COLOR[stage.stage_type]}22`,
                      color: STAGE_COLOR[stage.stage_type],
                      fontSize: 11,
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {STAGE_LABEL[stage.stage_type]}
                  </span>
                  <strong style={{ fontSize: 15, marginLeft: 8 }}>{stage.name}</strong>
                </div>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  {STATUS_LABEL[stage.workflow_status]}
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                {stage.episode_ids.length > 0
                  ? `包含 ${stage.episode_ids.length} 集：${stage.episode_ids.join(", ")}`
                  : "暂未关联集次"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  sort_order: {stage.sort_order}
                  {stage.updated_at ? ` · 更新于 ${new Date(stage.updated_at).toLocaleString()}` : ""}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={buttonStyle} onClick={() => openEdit(stage)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    style={{ ...buttonStyle, color: "#ff8b8b", borderColor: "rgba(255,139,139,0.4)" }}
                    onClick={() => void handleDelete(stage.id)}
                    disabled={deletingId === stage.id}
                  >
                    {deletingId === stage.id ? "删除中..." : "删除"}
                  </button>
                </div>
              </div>
            </div>
          ))}
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
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{form.id ? "编辑叙事阶段" : "新建叙事阶段"}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={labelStyle}>
                项目 ID
                <input
                  style={inputStyle}
                  value={form.project_id}
                  onChange={(event) => setForm((current) => ({ ...current, project_id: event.target.value }))}
                />
              </label>
              <label style={labelStyle}>
                阶段名称 *
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例：第一季·开端"
                />
              </label>
              <label style={labelStyle}>
                阶段类型
                <select
                  style={inputStyle}
                  value={form.stage_type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, stage_type: event.target.value as StoryStage["stage_type"] }))
                  }
                >
                  {STAGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {STAGE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                工作流状态
                <select
                  style={inputStyle}
                  value={form.workflow_status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      workflow_status: event.target.value as StoryStage["workflow_status"],
                    }))
                  }
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                关联集次 (用逗号分隔)
                <input
                  style={inputStyle}
                  value={form.episode_ids}
                  onChange={(event) => setForm((current) => ({ ...current, episode_ids: event.target.value }))}
                  placeholder="ep01, ep02, ep03"
                />
              </label>
              <label style={labelStyle}>
                排序
                <input
                  type="number"
                  style={inputStyle}
                  value={form.sort_order}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))
                  }
                />
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

function createEmptyForm(projectId: string): StageForm {
  return {
    project_id: projectId,
    name: "",
    stage_type: "setup",
    workflow_status: "planning",
    episode_ids: "",
    sort_order: 0,
  };
}
