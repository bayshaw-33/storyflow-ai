"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  useCardDraw,
  type CardDrawRecord,
  type DrawnCard,
} from "@/lib/production/hooks";

type DrawType = "character" | "scene" | "prop" | "mixed";

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
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "#f4f7f8",
  cursor: "pointer",
  fontSize: 13,
};

const rarityColors: Record<string, string> = {
  common: "rgba(255,255,255,0.6)",
  rare: "#6de7df",
  epic: "#c9a7ff",
  legendary: "#ffd166",
  mythic: "#ff8bd6",
};

const drawTypeLabels: Record<DrawType, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
  mixed: "混合",
};

const drawTypeOptions: DrawType[] = ["character", "scene", "prop", "mixed"];

export default function CardDrawPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <CardDrawContent />
    </Suspense>
  );
}

function CardDrawContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "draft";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [drawType, setDrawType] = useState<DrawType>("mixed");
  const [drawCount, setDrawCount] = useState(3);
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [poolCount, setPoolCount] = useState(0);
  const [history, setHistory] = useState<CardDrawRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const cardDraw = useCardDraw(session, projectId);

  useEffect(() => {
    document.title = "抽卡系统 | Kiikis";
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

  const loadHistory = useCallback(async () => {
    if (!session) return;
    setHistoryError(null);
    try {
      const list = await cardDraw.history(20);
      setHistory(list);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "加载抽卡历史失败。");
    }
  }, [session, cardDraw]);

  useEffect(() => {
    if (session) void loadHistory();
  }, [session, loadHistory]);

  const handleDraw = useCallback(async () => {
    try {
      const result = await cardDraw.draw(drawType, drawCount);
      setDrawnCards(result.cards);
      setPoolCount(result.poolCount);
      await loadHistory();
    } catch {
      // 错误已通过 cardDraw.error 暴露
    }
  }, [cardDraw, drawType, drawCount, loadHistory]);

  const handleClearHistory = useCallback(async () => {
    if (!window.confirm("确认清空抽卡历史？此操作不可撤销。")) return;
    setClearing(true);
    try {
      await cardDraw.clearHistory();
      setHistory([]);
      await loadHistory();
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }, [cardDraw, loadHistory]);

  const rarityLabel = useCallback((rarity: string) => rarity || "common", []);

  const groupedDrawnCards = useMemo(() => {
    return drawnCards;
  }, [drawnCards]);

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
        <h1 style={titleStyle}>抽卡系统</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          项目 ID：{projectId}
        </p>
      </header>
      <section style={sectionStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>抽卡模式</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {drawTypeOptions.map((option) => (
              <button
                key={option}
                type="button"
                style={{
                  ...buttonStyle,
                  borderColor: drawType === option ? "#6de7df" : "rgba(255,255,255,0.18)",
                  color: drawType === option ? "#6de7df" : "#f4f7f8",
                }}
                onClick={() => setDrawType(option)}
              >
                {drawTypeLabels[option]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              数量：
              <select
                value={drawCount}
                onChange={(event) => setDrawCount(Number(event.target.value) || 1)}
                style={{
                  marginLeft: 8,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.05)",
                  color: "#f4f7f8",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                <option value={1}>1</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </label>
            <button
              type="button"
              style={{ ...buttonStyle, borderColor: "#6de7df", color: "#6de7df" }}
              onClick={() => void handleDraw()}
              disabled={cardDraw.loading}
            >
              {cardDraw.loading ? "抽卡中..." : "开始抽卡"}
            </button>
          </div>
          {poolCount > 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              卡池总数：{poolCount}
            </div>
          )}
          {cardDraw.error && (
            <div style={{ ...noticeStyle, color: "#ff8b8b", marginTop: 12 }}>{cardDraw.error}</div>
          )}
        </div>

        {groupedDrawnCards.length > 0 && (
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>本次抽卡结果</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {groupedDrawnCards.map((card) => (
                <div
                  key={card.assetId + card.drawnAt}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${rarityColors[rarityLabel(card.rarity)] || "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  {card.imageUrl && (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      style={{ width: "100%", borderRadius: 6, marginBottom: 8, display: "block" }}
                    />
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ fontSize: 14 }}>{card.name}</strong>
                    <span style={{ fontSize: 11, color: rarityColors[rarityLabel(card.rarity)] || "rgba(255,255,255,0.5)" }}>
                      {card.rarity || "common"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6de7df", marginBottom: 4 }}>
                    {card.kind} · {card.narrativeRole}
                  </div>
                  {card.description && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{card.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>抽卡历史</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={buttonStyle} onClick={() => void loadHistory()}>
                刷新
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void handleClearHistory()}
                disabled={clearing || history.length === 0}
              >
                {clearing ? "清除中..." : "清空历史"}
              </button>
            </div>
          </div>
          {historyError && <div style={{ ...noticeStyle, color: "#ff8b8b" }}>{historyError}</div>}
          {!historyError && history.length === 0 && (
            <div style={noticeStyle}>暂无抽卡历史。</div>
          )}
          {history.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((record) => (
                <div
                  key={record.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>
                      {record.label || drawTypeLabels[(record.drawType as DrawType) || "mixed"]}
                    </strong>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {record.createdAt ? new Date(record.createdAt).toLocaleString() : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                    {drawTypeLabels[(record.drawType as DrawType) || "mixed"]} · 卡池 {record.poolCount} · 抽到 {record.drawnCount}
                  </div>
                  {record.drawnCards.length > 0 && (
                    <div style={{ fontSize: 12, color: "#6de7df", marginTop: 4 }}>
                      {record.drawnCards.map((card) => card.name).filter(Boolean).join("、")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
