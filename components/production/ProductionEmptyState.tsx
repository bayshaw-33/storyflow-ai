"use client";

/**
 * ProductionEmptyState — 制作工作台空状态页。
 *
 * Task card: KIIKIS 制作工作台 PRD 任务 1b
 *
 * 当 URL 无 projectId/sourceUnitId 时，替代旧的"无法进入分镜制作台"报错页。
 * 按入口参数（mode=planning → 分镜表 Tab / mode=editor → 分镜图 Tab）展示对应
 * 功能区的空状态，提供三个动作：上传剧本、从已有项目选择、新建项目/宇宙。
 */

import { type CSSProperties, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FileText, FolderOpen, Plus, Film, Clapperboard, ChevronRight } from "lucide-react";

export type EntryMode = "planning" | "editor";

type ProjectRow = {
  id: string;
  title: string;
  workflow_type: string;
};

type EpisodeRow = {
  id: string;
  episode_no: number;
  title: string;
};

type Props = {
  supabaseClient: SupabaseClient | null;
  entryMode: EntryMode;
  onPickProject: (projectId: string, sourceUnitId: string) => void;
};

export function ProductionEmptyState({ supabaseClient, entryMode, onPickProject }: Props) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isVideoEntry = entryMode === "editor";

  async function openPicker() {
    setPickerOpen(true);
    setError("");
    if (!supabaseClient) return;
    setLoading(true);
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        setError("请先登录后选择项目。");
        return;
      }
      const { data, error: fetchErr } = await supabaseClient
        .from("storyflow_projects")
        .select("id,title,workflow_type")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (fetchErr) throw fetchErr;
      setProjects((data as ProjectRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载项目列表失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedProjectId || !supabaseClient) return;
    (async () => {
      try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) return;
        const { data, error: fetchErr } = await supabaseClient
          .from("storyflow_episodes")
          .select("id,episode_no,title")
          .eq("project_id", selectedProjectId)
          .eq("user_id", userId)
          .order("episode_no", { ascending: true });
        if (fetchErr) throw fetchErr;
        setEpisodes((data as EpisodeRow[]) || []);
      } catch {
        setEpisodes([]);
      }
    })();
  }, [selectedProjectId, supabaseClient]);

  const entryLabel = isVideoEntry ? "分镜图与即梦提示词" : "分镜表";
  const EntryIcon = isVideoEntry ? Film : Clapperboard;

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div style={iconWrapStyle}>
            <EntryIcon size={32} strokeWidth={1.5} />
          </div>
          <h1 style={titleStyle}>制作工作台</h1>
          <p style={subtitleStyle}>
            未选择项目。选择以下方式开始，进入 <span style={entryHighlightStyle}>{entryLabel}</span> 工作区。
          </p>
        </div>

        <div style={actionsStyle}>
          {/* Action 1: 上传剧本开始 */}
          <button
            style={cardStyle}
            type="button"
            onClick={() => router.push("/novel-workbench?new=1&setup=1")}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)"; }}
          >
            <FileText size={24} strokeWidth={1.5} color="var(--ink-secondary)" />
            <div style={cardTextStyle}>
              <div style={cardTitleStyle}>上传剧本开始</div>
              <div style={cardDescStyle}>从剧本/小说入手，生成分镜后再进入制作台</div>
            </div>
            <ChevronRight size={16} color="var(--ink-muted)" />
          </button>

          {/* Action 2: 从已有项目选择 */}
          <button
            style={cardStyle}
            type="button"
            onClick={pickerOpen ? undefined : openPicker}
            onMouseEnter={(e) => { if (!pickerOpen) (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border-hover)"; }}
            onMouseLeave={(e) => { if (!pickerOpen) (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)"; }}
          >
            <FolderOpen size={24} strokeWidth={1.5} color="var(--ink-secondary)" />
            <div style={cardTextStyle}>
              <div style={cardTitleStyle}>从已有项目选择</div>
              <div style={cardDescStyle}>选定项目与集次，直接进入对应分镜工作区</div>
            </div>
            <ChevronRight size={16} color="var(--ink-muted)" />
          </button>

          {/* Action 3: 新建项目/宇宙 */}
          <button
            style={cardStyle}
            type="button"
            onClick={() => router.push("/dashboard")}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)"; }}
          >
            <Plus size={24} strokeWidth={1.5} color="var(--ink-secondary)" />
            <div style={cardTextStyle}>
              <div style={cardTitleStyle}>新建项目 / 宇宙</div>
              <div style={cardDescStyle}>在 Dashboard 创建新项目或宇宙系列</div>
            </div>
            <ChevronRight size={16} color="var(--ink-muted)" />
          </button>
        </div>

        {/* Project picker */}
        {pickerOpen && (
          <div style={pickerStyle}>
            <div style={pickerHeaderStyle}>
              <h3 style={pickerTitleStyle}>选择项目</h3>
              <button style={closeBtnStyle} type="button" onClick={() => { setPickerOpen(false); setSelectedProjectId(null); setEpisodes([]); }}>✕</button>
            </div>
            {error && <p style={errorStyle}>{error}</p>}
            {loading && <p style={loadingStyle}>加载中…</p>}
            {!loading && !selectedProjectId && projects.length === 0 && !error && (
              <p style={emptyStyle}>暂无项目。请先在 Dashboard 或剧本工作台创建项目。</p>
            )}
            {!selectedProjectId && projects.length > 0 && (
              <div style={listStyle}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    style={itemStyle}
                    type="button"
                    onClick={() => { setSelectedProjectId(p.id); setEpisodes([]); }}
                  >
                    <span style={itemTitleStyle}>{p.title || "未命名项目"}</span>
                    <span style={itemBadgeStyle}>{p.workflow_type || "project"}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedProjectId && (
              <>
                <div style={backRowStyle}>
                  <button style={backBtnStyle} type="button" onClick={() => { setSelectedProjectId(null); setEpisodes([]); }}>← 返回项目列表</button>
                </div>
                {episodes.length === 0 ? (
                  <p style={emptyStyle}>该项目暂无集次。请先在剧本工作台创建集次。</p>
                ) : (
                  <div style={listStyle}>
                    {episodes.map((ep) => (
                      <button
                        key={ep.id}
                        style={itemStyle}
                        type="button"
                        onClick={() => onPickProject(selectedProjectId, ep.id)}
                      >
                        <span style={itemTitleStyle}>第 {ep.episode_no} 集{ep.title ? ` · ${ep.title}` : ""}</span>
                        <ChevronRight size={14} color="var(--ink-muted)" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// --- Styles (using CSS variables from globals.css for site-wide consistency) ---

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--bg-void)",
  color: "var(--ink-primary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 24px",
};

const containerStyle: CSSProperties = {
  width: "100%",
  maxWidth: "640px",
  display: "flex",
  flexDirection: "column",
  gap: "32px",
};

const headerStyle: CSSProperties = {
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
};

const iconWrapStyle: CSSProperties = {
  width: "64px",
  height: "64px",
  borderRadius: "16px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--glass-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--ink-secondary)",
};

const titleStyle: CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  margin: 0,
  color: "var(--ink-primary)",
};

const subtitleStyle: CSSProperties = {
  fontSize: "14px",
  color: "var(--ink-secondary)",
  margin: 0,
  lineHeight: 1.6,
};

const entryHighlightStyle: CSSProperties = {
  color: "var(--ink-primary)",
  fontWeight: 500,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "20px 24px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--glass-border)",
  borderRadius: "12px",
  cursor: "pointer",
  textAlign: "left",
  transition: "border-color 0.15s",
  width: "100%",
};

const cardTextStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const cardTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 500,
  color: "var(--ink-primary)",
};

const cardDescStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--ink-muted)",
  lineHeight: 1.5,
};

const pickerStyle: CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--glass-border)",
  borderRadius: "12px",
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const pickerHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const pickerTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 500,
  margin: 0,
  color: "var(--ink-primary)",
};

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--ink-muted)",
  cursor: "pointer",
  fontSize: "16px",
  padding: "4px 8px",
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  maxHeight: "320px",
  overflowY: "auto",
};

const itemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  background: "var(--glass-fill)",
  border: "1px solid transparent",
  borderRadius: "8px",
  cursor: "pointer",
  textAlign: "left",
  transition: "border-color 0.15s",
};

const itemTitleStyle: CSSProperties = {
  fontSize: "14px",
  color: "var(--ink-primary)",
};

const itemBadgeStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--ink-muted)",
  background: "var(--text-hover-bg)",
  padding: "2px 8px",
  borderRadius: "4px",
};

const backRowStyle: CSSProperties = {
  display: "flex",
};

const backBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--ink-secondary)",
  cursor: "pointer",
  fontSize: "13px",
  padding: "4px 0",
};

const errorStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--danger)",
  margin: 0,
};

const loadingStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--ink-muted)",
  margin: 0,
};

const emptyStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--ink-muted)",
  margin: 0,
  padding: "16px",
  textAlign: "center",
};
