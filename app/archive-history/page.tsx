"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ExportArchive = {
  id: string;
  project_id: string;
  owner_id: string;
  archive_schema_version: string;
  manifest_json: Record<string, unknown> | null;
  sha256: string;
  storage_path: string;
  file_size_bytes: number;
  previous_archive_id: string | null;
  status: "active" | "superseded" | "verified" | "corrupted";
  created_at: string;
};

type VerificationState = {
  [archiveId: string]: {
    status: "pending" | "ok" | "mismatch" | "error";
    message: string;
    computedSha?: string;
  };
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

const STATUS_LABEL: Record<ExportArchive["status"], string> = {
  active: "活跃",
  superseded: "已被替代",
  verified: "已验证",
  corrupted: "已损坏",
};

const STATUS_COLOR: Record<ExportArchive["status"], string> = {
  active: "#6de7df",
  superseded: "rgba(255,255,255,0.5)",
  verified: "#7dd181",
  corrupted: "#ff8b8b",
};

export default function ArchiveHistoryPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <ArchiveHistoryContent />
    </Suspense>
  );
}

function ArchiveHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [archives, setArchives] = useState<ExportArchive[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState>({});

  useEffect(() => {
    document.title = "档案历史与验证 | Kiikis";
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

  const loadArchives = useCallback(
    async (token: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = projectId
          ? `/api/export-archives?projectId=${encodeURIComponent(projectId)}`
          : `/api/export-archives`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "读取档案列表失败。");
        }
        const payload = await response.json();
        setArchives(Array.isArray(payload.archives) ? payload.archives : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "读取档案列表失败。");
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!session?.access_token) return;
    void loadArchives(session.access_token);
  }, [session, loadArchives]);

  const archivesById = useMemo(() => {
    const map = new Map<string, ExportArchive>();
    for (const item of archives) map.set(item.id, item);
    return map;
  }, [archives]);

  const handleVerify = async (archive: ExportArchive) => {
    if (!session?.access_token) return;
    setVerification((current) => ({
      ...current,
      [archive.id]: { status: "pending", message: "正在重新计算 sha256..." },
    }));
    try {
      // 前端基于 manifest_json 重新计算 sha256（使用 Web Crypto API）。
      // 真实生产中应由后端拉取 storage_path 中的文件再计算；此处先做 manifest 摘要比对。
      const manifestText = JSON.stringify(archive.manifest_json || {});
      const buffer = new TextEncoder().encode(manifestText);
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const computedSha = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // 与数据库存储的 sha256 比对（数据库的 sha256 通常包含文件内容，这里仅做 manifest 比对提示）
      const matchesPrefix = archive.sha256.startsWith(computedSha.slice(0, 12)) || computedSha.startsWith(archive.sha256.slice(0, 12));
      setVerification((current) => ({
        ...current,
        [archive.id]: matchesPrefix
          ? {
              status: "ok",
              message: "manifest 摘要校验通过（前端 SHA-256 计算）",
              computedSha,
            }
          : {
              status: "mismatch",
              message: "manifest 摘要与数据库 sha256 不一致（前端计算）。建议拉取实际归档文件复核。",
              computedSha,
            },
      }));
    } catch (err) {
      setVerification((current) => ({
        ...current,
        [archive.id]: {
          status: "error",
          message: err instanceof Error ? err.message : "校验失败。",
        },
      }));
    }
  };

  const handleDownloadManifest = (archive: ExportArchive) => {
    const manifestText = JSON.stringify(archive.manifest_json || {}, null, 2);
    const blob = new Blob([manifestText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `manifest-${archive.id.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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
        <h1 style={titleStyle}>档案历史与验证</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          {projectId ? `项目 ID：${projectId} · ` : ""}共 {archives.length} 个档案
          {projectId ? "" : "（未指定 projectId，展示当前用户全部档案）"}
        </p>
      </header>
      <section style={sectionStyle}>
        <div style={{ ...cardStyle, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void loadArchives(session.access_token)}
            disabled={loading}
          >
            刷新档案列表
          </button>
          {loading && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>加载中...</span>}
        </div>

        {error && <div style={{ ...noticeStyle, color: "#ff8b8b", marginBottom: 16 }}>{error}</div>}

        {archives.length === 0 && !loading && !error && (
          <div style={noticeStyle}>暂无档案。导出项目归档后，sha256 与 manifest 链将出现在这里。</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {archives.map((archive) => {
            const prev = archive.previous_archive_id ? archivesById.get(archive.previous_archive_id) : null;
            const verifyState = verification[archive.id];
            return (
              <div key={archive.id} style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 6 }}>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 12,
                        background: `${STATUS_COLOR[archive.status]}22`,
                        color: STATUS_COLOR[archive.status],
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {STATUS_LABEL[archive.status]}
                    </span>
                    <strong style={{ fontSize: 14, marginLeft: 8 }}>schema v{archive.archive_schema_version}</strong>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {new Date(archive.created_at).toLocaleString()}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 4, wordBreak: "break-all" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>sha256: </span>
                  <code style={{ fontFamily: "ui-monospace, monospace" }}>{archive.sha256}</code>
                </div>

                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>
                  项目：{archive.project_id} · 大小：{(archive.file_size_bytes / 1024).toFixed(1)} KB
                </div>

                {prev && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
                    ↑ 前一档案：{prev.sha256.slice(0, 16)}... · 创建于 {new Date(prev.created_at).toLocaleString()}
                  </div>
                )}

                {archive.manifest_json && (
                  <details style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                    <summary style={{ cursor: "pointer", color: "#6de7df" }}>manifest 摘要</summary>
                    <pre
                      style={{
                        margin: "8px 0 0",
                        padding: 10,
                        borderRadius: 6,
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        overflowX: "auto",
                        fontSize: 11,
                        color: "rgba(255,255,255,0.85)",
                      }}
                    >
                      {JSON.stringify(archive.manifest_json, null, 2).slice(0, 800)}
                      {JSON.stringify(archive.manifest_json, null, 2).length > 800 ? "\n..." : ""}
                    </pre>
                  </details>
                )}

                {verifyState && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 6,
                      background:
                        verifyState.status === "ok"
                          ? "rgba(125,209,129,0.08)"
                          : verifyState.status === "mismatch"
                            ? "rgba(255,139,139,0.08)"
                            : "rgba(255,255,255,0.04)",
                      border: `1px solid ${verifyState.status === "ok" ? "rgba(125,209,129,0.3)" : verifyState.status === "mismatch" ? "rgba(255,139,139,0.3)" : "rgba(255,255,255,0.1)"}`,
                      fontSize: 12,
                      color:
                        verifyState.status === "ok"
                          ? "#7dd181"
                          : verifyState.status === "mismatch"
                            ? "#ff8b8b"
                            : "rgba(255,255,255,0.7)",
                    }}
                  >
                    {verifyState.message}
                    {verifyState.computedSha && (
                      <div style={{ marginTop: 4, wordBreak: "break-all", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                        计算 sha256: {verifyState.computedSha.slice(0, 32)}...
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    onClick={() => void handleVerify(archive)}
                    disabled={verifyState?.status === "pending"}
                  >
                    {verifyState?.status === "pending" ? "验证中..." : "验证 sha256"}
                  </button>
                  <button type="button" style={buttonStyle} onClick={() => handleDownloadManifest(archive)}>
                    下载 manifest.json
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
