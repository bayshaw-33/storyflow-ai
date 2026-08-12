"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  fetchModelLibrary,
  USE_FIXTURE,
  type ModelLibraryResult,
} from "@/lib/client/v2/models/api";
import {
  matchRecommendation,
  buildDecisionRuntime,
  type RecommendationMatch,
} from "@/lib/client/v2/models/router";
import {
  CONTRACT_VERSION,
  type ModelDecisionRuntime,
  type ModelDescriptor,
  type ModelFilters,
  type RoutingRecord,
  type SelectionMode,
} from "@/lib/client/v2/models/types";
import { SmartRecommendation } from "./SmartRecommendation";
import { ProfessionalSelector } from "./ProfessionalSelector";
import { CostPreview } from "./CostPreview";
import { DegradationNotice } from "./DegradationNotice";
import { RoutingHistory } from "./RoutingHistory";

interface ModelRouterProps {
  /** 当前任务类型，用于触发智能推荐匹配 */
  taskType?: string;
  /** 任务参数，用于精细化推荐匹配 */
  taskParams?: Record<string, string>;
}

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
  letterSpacing: 1,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(24px, 2vw, 34px)",
  fontWeight: 900,
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,0.6)",
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const sourceBadgeStyle = (source: string): React.CSSProperties => ({
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border:
    source === "fixture"
      ? "1px solid rgba(255,209,102,0.4)"
      : "1px solid rgba(125,209,129,0.4)",
  color: source === "fixture" ? "#ffd166" : "#7dd181",
});

const sectionStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto",
};

const modeToggleStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: 4,
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
  gap: 4,
};

const modeButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: active ? "#6de7df" : "transparent",
  color: active ? "#070808" : "rgba(255,255,255,0.7)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
});

const noticeStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  color: "#f4f7f8",
  fontSize: 14,
};

const errorStyle: React.CSSProperties = {
  ...noticeStyle,
  color: "#ff8b8b",
  marginBottom: 16,
};

const emptyStyle: React.CSSProperties = {
  padding: "32px 24px",
  textAlign: "center",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px dashed rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.6)",
};

const skeletonCardStyle: React.CSSProperties = {
  height: 160,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 16,
};

const decisionChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(109,231,223,0.10)",
  border: "1px solid rgba(109,231,223,0.32)",
  color: "#6de7df",
  fontSize: 12,
  fontWeight: 700,
};

/**
 * K2-T-04 多模型选择与解释 主入口。
 *
 * 对齐 PRD §8.4：
 *   - 智能模式（默认）：根据 taskType + taskParams 推荐模型并附可读理由
 *   - 专业模式：手动按多维度筛选并选择
 *   - 任务前成本预览
 *   - 降级可读提示
 *   - 路由记录列表
 *
 * 复用 Atlas Cloud 已有模型能力（lib/art/providers/catalog.ts、lib/ai/providers），
 * 不重新实现 provider 接入。
 */
export function ModelRouter({ taskType, taskParams = {} }: ModelRouterProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const [library, setLibrary] = useState<ModelLibraryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<SelectionMode>("smart");
  const [filters, setFilters] = useState<ModelFilters>({});
  const [selectedModel, setSelectedModel] = useState<ModelDescriptor | null>(null);

  useEffect(() => {
    document.title = isZh ? "模型选择 | Kiikis" : "Model Router | Kiikis";
  }, [isZh]);

  // 认证：未登录跳转 /login
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
    if (sessionLoaded && !session) router.push("/login");
  }, [sessionLoaded, session, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchModelLibrary(session?.access_token ?? null);
      if (result.contractVersion !== CONTRACT_VERSION) {
        throw new Error(
          isZh
            ? `模型契约版本不匹配：fixture=${result.contractVersion}, client=${CONTRACT_VERSION}`
            : `Contract mismatch: fixture=${result.contractVersion}, client=${CONTRACT_VERSION}`,
        );
      }
      setLibrary(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isZh
            ? "加载模型库失败。"
            : "Failed to load model library.",
      );
    } finally {
      setLoading(false);
    }
  }, [session, isZh]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  // 智能推荐匹配（基于 taskType + taskParams）
  const recommendation: RecommendationMatch | null = useMemo(() => {
    if (!library || !taskType) return null;
    return matchRecommendation(
      library.recommendations,
      library.models,
      taskType,
      taskParams,
    );
  }, [library, taskType, taskParams]);

  // 当前生效的模型：用户选择 > 推荐 > null
  const activeModel: ModelDescriptor | null = useMemo(() => {
    if (selectedModel) return selectedModel;
    if (recommendation) return recommendation.model;
    return null;
  }, [selectedModel, recommendation]);

  // 当前任务的路由记录（从历史中找 jobId 或最近一条）
  const latestRouting: RoutingRecord | null = useMemo(() => {
    if (!library || library.routingRecords.length === 0) return null;
    return library.routingRecords[library.routingRecords.length - 1];
  }, [library]);

  // 降级提示：当最新路由记录发生降级时展示
  const degradationInfo: { original: ModelDescriptor | null; actual: ModelDescriptor; reason: string | null } | null = useMemo(() => {
    if (!library || !latestRouting || !latestRouting.degraded) return null;
    const original = library.models.find((m) => m.id === latestRouting.systemRecommendation) || null;
    const actual = library.models.find((m) => m.id === latestRouting.actualModel);
    if (!actual) return null;
    return {
      original,
      actual,
      reason: latestRouting.downgradeReason || null,
    };
  }, [library, latestRouting]);

  // 构造运行时决策（对齐 Codex 契约 ModelDecision）
  const decision: ModelDecisionRuntime | null = useMemo(() => {
    if (!activeModel) return null;
    return buildDecisionRuntime(
      mode,
      recommendation?.recommendation || null,
      selectedModel,
      degradationInfo?.actual || activeModel,
      Boolean(degradationInfo),
      degradationInfo?.reason,
    );
  }, [mode, recommendation, selectedModel, activeModel, degradationInfo]);

  const handleAcceptRecommendation = useCallback(() => {
    if (recommendation) setSelectedModel(recommendation.model);
  }, [recommendation]);

  const handleSwitchProfessional = useCallback(() => {
    setMode("professional");
  }, []);

  if (!sessionLoaded || (!session && loading)) {
    return (
      <main style={shellStyle}>
        <header style={headerStyle}>
          <p style={eyebrowStyle}>Kiikis Model Router</p>
          <h1 style={titleStyle}>{isZh ? "模型选择" : "Model Router"}</h1>
        </header>
        <section style={sectionStyle}>
          <div style={skeletonCardStyle} />
          <div style={skeletonCardStyle} />
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={shellStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>{isZh ? "请先登录" : "Please sign in"}</h1>
          <p style={subtitleStyle}>{isZh ? "正在跳转到登录页..." : "Redirecting to login..."}</p>
        </header>
      </main>
    );
  }

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Kiikis Model Router</p>
        <h1 style={titleStyle}>{isZh ? "多模型选择与解释" : "Model Selection & Explanation"}</h1>
        <p style={subtitleStyle}>
          <span>
            {isZh ? "模型库" : "Library"}: <strong style={{ color: "#f4f7f8" }}>{library?.models.length ?? 0}</strong>
          </span>
          <span>
            {isZh ? "推荐场景" : "Scenarios"}: <strong style={{ color: "#f4f7f8" }}>{library?.recommendations.length ?? 0}</strong>
          </span>
          <span>
            {isZh ? "路由记录" : "Routing"}: <strong style={{ color: "#f4f7f8" }}>{library?.routingRecords.length ?? 0}</strong>
          </span>
          {library && (
            <span style={sourceBadgeStyle(library.source)}>
              {library.source === "fixture" ? (isZh ? "演示数据" : "Fixture") : (isZh ? "实时" : "Live")}
            </span>
          )}
          {USE_FIXTURE && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {isZh ? "（fixture 模式，不调用真实 API）" : "(fixture mode)"}
            </span>
          )}
        </p>
      </header>

      <section style={sectionStyle}>
        {error && <div style={errorStyle}>{error}</div>}

        {/* 模式切换 */}
        <div style={modeToggleStyle}>
          <button
            type="button"
            style={modeButtonStyle(mode === "smart")}
            onClick={() => setMode("smart")}
          >
            {isZh ? "智能推荐" : "Smart"}
          </button>
          <button
            type="button"
            style={modeButtonStyle(mode === "professional")}
            onClick={() => setMode("professional")}
          >
            {isZh ? "专业模式" : "Professional"}
          </button>
        </div>

        {/* 决策摘要 */}
        {decision && (
          <div style={{ marginBottom: 16 }}>
            <span style={decisionChipStyle}>
              {isZh ? "当前选择" : "Current"}: {activeModel?.name}
              {decision.wasDegraded && (
                <span style={{ color: "#ffd166", marginLeft: 6 }}>
                  · {isZh ? "已降级" : "Degraded"}
                </span>
              )}
            </span>
          </div>
        )}

        {/* 降级提示 */}
        {degradationInfo && (
          <DegradationNotice
            originalModel={degradationInfo.original}
            actualModel={degradationInfo.actual}
            reason={degradationInfo.reason}
            locale={locale}
          />
        )}

        {/* 成本预览 */}
        <CostPreview
          model={activeModel}
          actualModel={degradationInfo?.actual || null}
          locale={locale}
        />

        {/* 模式内容 */}
        {loading && !library ? (
          <div style={skeletonCardStyle} />
        ) : mode === "smart" ? (
          recommendation ? (
            <SmartRecommendation
              recommendation={recommendation.recommendation}
              model={recommendation.model}
              locale={locale}
              onAccept={handleAcceptRecommendation}
              onSwitchProfessional={handleSwitchProfessional}
            />
          ) : (
            <div style={emptyStyle}>
              <div style={{ fontSize: 16, marginBottom: 8, color: "#f4f7f8" }}>
                {isZh ? "暂无匹配推荐" : "No matching recommendation"}
              </div>
              <div>
                {isZh
                  ? "当前任务类型没有预置推荐，请切换到专业模式手动选择。"
                  : "No recommendation preconfigured for this task type. Switch to Professional mode."}
              </div>
            </div>
          )
        ) : (
          library && (
            <ProfessionalSelector
              models={library.models}
              filters={filters}
              onFiltersChange={setFilters}
              selectedModelId={selectedModel?.id ?? null}
              onSelect={setSelectedModel}
              taskType={taskType}
              locale={locale}
            />
          )
        )}

        {/* 路由记录历史 */}
        {library && (
          <div style={{ marginTop: 24 }}>
            <RoutingHistory
              records={library.routingRecords}
              models={library.models}
              locale={locale}
            />
          </div>
        )}
      </section>
    </main>
  );
}
