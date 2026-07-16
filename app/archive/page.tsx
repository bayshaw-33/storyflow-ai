"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { ExportMenu } from "@/components/production/ExportMenu";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useProductionSync } from "@/lib/production/hooks";
import { createEmptyProductionState } from "@/lib/production/state";
import type { ProductionProjectState } from "@/lib/production/types";

type ArchiveEntry = {
  id: string;
  projectId: string | null;
  format: string;
  fileName: string;
  url: string | null;
  size: number | null;
  createdAt: string | null;
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

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const listItemStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

export default function ArchivePage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <ArchiveContent />
    </Suspense>
  );
}

function ArchiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "draft";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [state, setState] = useState<ProductionProjectState>(() =>
    createEmptyProductionState({ projectId, mode: "planning" }),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [archivesError, setArchivesError] = useState<string | null>(null);
  const sync = useProductionSync(session, projectId);

  useEffect(() => {
    document.title = "创作档案 | Kiikis";
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
    if (!session) return;
    let active = true;
    void (async () => {
      try {
        const loaded = await sync.loadFromCloud();
        if (active && loaded) {
          setState(loaded);
        }
      } catch (err) {
        if (active) {
          setLoadError(err instanceof Error ? err.message : "加载项目状态失败。");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [session, sync]);

  const loadArchives = useCallback(async () => {
    if (!session) return;
    setArchivesLoading(true);
    setArchivesError(null);
    try {
      const params = new URLSearchParams({ projectId });
      const response = await fetch(`/api/exports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `加载档案失败 (HTTP ${response.status})`);
      }
      const list: ArchiveEntry[] = Array.isArray(payload?.archives)
        ? payload.archives.map((raw: Record<string, unknown>) => ({
            id: String(raw.id || ""),
            projectId: raw.project_id ? String(raw.project_id) : null,
            format: String(raw.format || ""),
            fileName: String(raw.file_name || raw.filename || ""),
            url: raw.url ? String(raw.url) : null,
            size: raw.size != null ? Number(raw.size) : null,
            createdAt: raw.created_at ? String(raw.created_at) : null,
          }))
        : [];
      setArchives(list);
    } catch (err) {
      setArchivesError(err instanceof Error ? err.message : "加载档案列表失败。");
    } finally {
      setArchivesLoading(false);
    }
  }, [session, projectId]);

  useEffect(() => {
    if (session) void loadArchives();
  }, [session, loadArchives]);

  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/login");
    }
  }, [sessionLoaded, session, router]);

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
        <h1 style={titleStyle}>创作档案</h1>
      </header>
      <section style={sectionStyle}>
        {sync.loading && <div style={noticeStyle}>正在加载项目数据...</div>}
        {loadError && <div style={{ ...noticeStyle, color: "#ff8b8b" }}>{loadError}</div>}
        {sync.error && <div style={{ ...noticeStyle, color: "#ff8b8b" }}>{sync.error}</div>}

        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>导出新档案</h2>
          <ExportMenu state={state} />
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>已导出的档案</h2>
            <button
              type="button"
              onClick={() => void loadArchives()}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "#f4f7f8",
                cursor: "pointer",
              }}
            >
              刷新
            </button>
          </div>
          {archivesLoading && <div style={noticeStyle}>正在加载档案列表...</div>}
          {archivesError && <div style={{ ...noticeStyle, color: "#ff8b8b" }}>{archivesError}</div>}
          {!archivesLoading && !archivesError && archives.length === 0 && (
            <div style={noticeStyle}>暂无已导出的档案。</div>
          )}
          {archives.length > 0 && (
            <ul style={listStyle}>
              {archives.map((entry) => (
                <li key={entry.id} style={listItemStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{entry.fileName || entry.format || "未命名档案"}</strong>
                    <span style={{ color: "#6de7df", fontSize: 12 }}>{entry.format}</span>
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}
                    {entry.size != null ? ` · ${Math.max(1, Math.round(entry.size / 1024))} KB` : ""}
                  </div>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#6de7df", fontSize: 13, textDecoration: "none" }}
                    >
                      下载 →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
