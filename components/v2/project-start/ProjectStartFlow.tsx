"use client";

/**
 * KIIKIS V2.2 — 项目入口（8 模块方格 + 确认式创建）。
 *
 * P0-06（PRD §4）：模块点击只打开轻量创建确认页 —— 用户选择项目名
 * （placeholder 为默认标题，采用"未命名项目"必须显式确认）、确认起始
 * 模块、可选绑定 Universe 之后才调用 startProject。
 *   - cancel / 关闭面板 / 浏览器返回：零副作用（无 API 调用、无路由跳转）
 *   - 幂等键每次提交只生成一次，失败重试复用（服务端 + RPC 兜底）
 *   - 七个 V2 方格走 startProject，改编方格复用既有改编工作台
 *   - 服务端返回的 workbenchRoute 直接用于导航（客户端不构造路由）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileText,
  Flame,
  Globe,
  LayoutGrid,
  Mic,
  Music,
  Palette,
  RefreshCw,
  Scissors,
  Video,
} from "lucide-react";

import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { startProject } from "@/lib/client/v2/project-start/api";
import {
  WORK_TYPE_CARDS,
  defaultTitleFor,
  type WorkTypeCardMeta,
} from "@/lib/client/v2/project-start/helpers";
import type { WorkType } from "@/lib/contracts/v2/work";

import styles from "./ProjectStartFlow.module.css";

// 将 WORK_TYPE_CARDS 中的字符串 icon 名映射到 lucide 组件。
const ICON_MAP: Record<string, typeof FileText> = {
  FileText,
  Flame,
  Music,
  Palette,
  LayoutGrid,
  Video,
  Mic,
  Scissors,
};

type UniverseOption = { id: string; name: string };

export function ProjectStartFlow() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  // 认证状态
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 提交状态：正在创建的 workType + 错误信息
  const [pendingType, setPendingType] = useState<WorkType | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // P0-06：确认面板状态。pendingModule 非空即打开确认；取消只清本地状态。
  const [pendingModule, setPendingModule] = useState<WorkTypeCardMeta | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [universeOptions, setUniverseOptions] = useState<UniverseOption[]>([]);
  const [universeId, setUniverseId] = useState("");
  const [universeState, setUniverseState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // P0-06：幂等键每次提交生成一次；失败重试复用，成功导航后清空。
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      // 无 Supabase 配置（如本地预览）：仍允许展示入口方格，
      // 但确认创建会因缺少 auth token 抛 401。
      setAuthChecked(true);
      setIsLoggedIn(false);
      return;
    }
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setIsLoggedIn(!!data.session);
        setAuthChecked(true);
      })
      .catch(() => {
        if (!active) return;
        setIsLoggedIn(false);
        setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // 未登录跳转登录页
  useEffect(() => {
    if (authChecked && !isLoggedIn) {
      router.replace("/login");
    }
  }, [authChecked, isLoggedIn, router]);

  // 打开确认面板时按需加载 Universe 列表（可选绑定，失败不阻塞创建）
  useEffect(() => {
    if (!pendingModule || universeState !== "idle") return;
    let cancelled = false;
    setUniverseState("loading");
    void (async () => {
      try {
        const res = await fetchWithAuthRetry("/api/universe/summaries");
        const payload = (await res.json().catch(() => null)) as { universes?: Array<{ id: string; name?: string }> } | null;
        if (cancelled) return;
        if (res.ok && Array.isArray(payload?.universes)) {
          setUniverseOptions(payload!.universes!.map((u) => ({ id: String(u.id), name: u.name || "未命名宇宙" })));
          setUniverseState("ready");
        } else {
          setUniverseState("error");
        }
      } catch {
        if (!cancelled) setUniverseState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingModule, universeState]);

  const cancelPendingModule = useCallback(() => {
    // 零副作用：不调 API、不跳转；上一次失败留下的幂等键也一并丢弃，
    // 用户重新确认时重新生成，避免误复用已放弃的提交。
    setPendingModule(null);
    setTitleDraft("");
    setUniverseId("");
    setUniverseOptions([]);
    setUniverseState("idle");
    setSubmitError(null);
    idempotencyKeyRef.current = null;
  }, []);

  const handleStart = useCallback(
    async (workType: WorkType, title: string, selectedUniverseId: string) => {
      if (pendingType) return;
      setPendingType(workType);
      setSubmitError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await (supabase?.auth.getSession() ??
          Promise.resolve({ data: { session: null } }));
        const authToken = data.session?.access_token;
        if (!authToken) {
          setSubmitError(
            isZh ? "未登录，正在跳转登录页…" : "Not signed in, redirecting…",
          );
          router.replace("/login");
          return;
        }
        // P0-06：幂等键只在首次提交时生成；失败重试复用同一键，
        // 服务端 UNIQUE(owner_id, idempotency_key) 去重。
        idempotencyKeyRef.current ??=
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const result = await startProject({
          workType,
          authToken,
          idempotencyKey: idempotencyKeyRef.current,
          // 空输入 = 显式确认采用默认标题（placeholder 所示），不是静默落库
          title: title.trim() || defaultTitleFor(workType),
          universeId: selectedUniverseId || null,
        });
        // 成功：丢弃幂等键并按服务端返回的路由导航。
        idempotencyKeyRef.current = null;
        setPendingModule(null);
        router.push(result.workbenchRoute);
      } catch (err) {
        // 失败：确认面板保持打开、输入保留，重试复用同一幂等键。
        setSubmitError(
          err instanceof Error ? err.message : "unknown error",
        );
      } finally {
        setPendingType(null);
      }
    },
    [pendingType, isZh, router],
  );

  const headerCopy = useMemo(
    () => ({
      kicker: isZh ? "K2.2 · 开始创作" : "K2.2 · Start creating",
      title: isZh ? "开始一个新项目" : "Start a new project",
      subtitle: isZh
        ? "选择一个创作模块，确认项目名与可选的 Universe 后，系统会原子性地建立项目与对应工作台。"
        : "Pick a module, confirm the title and an optional Universe — the project and workbench are created atomically.",
    }),
    [isZh],
  );

  // 认证检查中
  if (!authChecked) {
    return (
      <div className={styles.fullscreenState}>
        <div className={styles.spinner} />
      </div>
    );
  }

  // 未登录态
  if (!isLoggedIn) {
    return (
      <div className={styles.fullscreenState}>
        <p>{isZh ? "正在跳转登录…" : "Redirecting to login…"}</p>
      </div>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.headerKicker}>{headerCopy.kicker}</p>
          <h1 className={styles.headerTitle}>{headerCopy.title}</h1>
          <p className={styles.headerSubtitle}>{headerCopy.subtitle}</p>
        </header>

        {/* 8 模块方格：同尺寸、同间距；点击只打开确认面板（P0-06） */}
        <section aria-label={isZh ? "创作模块" : "Creation modules"}>
          <div className={styles.moduleGrid}>
            {WORK_TYPE_CARDS.map((card) => {
              const Icon = ICON_MAP[card.icon] ?? FileText;
              const isPending = pendingModule?.id === card.id && pendingType !== null;
              const disabled = pendingModule !== null;
              return (
                <button
                  key={card.id}
                  type="button"
                  data-module-type={card.id}
                  className={`${styles.moduleCard} ${
                    isPending ? styles.moduleCardPending : ""
                  }`}
                  onClick={() => {
                    if (card.route) {
                      router.push(card.route);
                      return;
                    }
                    if (card.workType) {
                      setPendingModule(card);
                      setUniverseState("idle");
                    }
                  }}
                  disabled={disabled}
                  aria-busy={isPending}
                >
                  <span className={styles.moduleCardIcon}>
                    {isPending ? (
                      <span className={styles.cardSpinner} />
                    ) : (
                      <Icon size={22} />
                    )}
                  </span>
                  <h3 className={styles.moduleCardTitle}>
                    {isZh ? card.titleZh : card.titleEn}
                  </h3>
                  <p className={styles.moduleCardDesc}>
                    {isZh ? card.descZh : card.descEn}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {submitError && !pendingModule && (
          <div className={styles.errorBlock} role="alert">
            <AlertCircle size={18} className={styles.errorIcon} />
            <div className={styles.errorBody}>
              <p className={styles.errorTitle}>
                {isZh ? "创建失败" : "Create failed"}
              </p>
              <p className={styles.errorText}>{submitError}</p>
            </div>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => setSubmitError(null)}
            >
              <RefreshCw size={14} />
              {isZh ? "关闭" : "Dismiss"}
            </button>
          </div>
        )}
      </div>

      {/* P0-06：轻量创建确认面板。取消 = 零副作用；确认才调用 startProject。 */}
      {pendingModule ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isZh ? `确认创建${pendingModule.titleZh}项目` : `Confirm new ${pendingModule.titleEn} project`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(6, 8, 14, 0.72)",
            backdropFilter: "blur(4px)",
          }}
          onClick={cancelPendingModule}
        >
          <div
            style={{
              width: "min(460px, 100%)",
              borderRadius: 16,
              border: "1px solid var(--border, rgba(255,255,255,0.12))",
              background: "var(--surface, #10131c)",
              padding: "22px 22px 18px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>
              {isZh ? `创建${pendingModule.titleZh}项目` : `Create a ${pendingModule.titleEn} project`}
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--ink-secondary, #9aa3b2)" }}>
              {isZh ? "确认后才会创建项目与工作台；取消不会留下任何数据。" : "Nothing is created until you confirm; cancelling leaves no data behind."}
            </p>

            <label style={{ display: "block", fontSize: 12.5, marginBottom: 10 }}>
              <span style={{ display: "block", marginBottom: 6, color: "var(--ink-secondary, #9aa3b2)" }}>
                {isZh ? "项目名称" : "Project name"}
              </span>
              <input
                data-testid="project-title-input"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder={defaultTitleFor(pendingModule.workType!)}
                autoComplete="off"
                maxLength={80}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 12px",
                  borderRadius: 9,
                  border: "1px solid var(--border, rgba(255,255,255,0.14))",
                  background: "rgba(255,255,255,0.04)",
                  color: "inherit",
                  fontSize: 13.5,
                }}
              />
              <span style={{ display: "block", marginTop: 5, fontSize: 11.5, color: "var(--ink-secondary, #9aa3b2)" }}>
                {isZh ? "留空则使用默认名称（如“未命名剧本”），确认后生效。" : "Leave blank to use the default name after confirming."}
              </span>
            </label>

            <div style={{ fontSize: 12.5, marginBottom: 12 }}>
              <span style={{ display: "block", marginBottom: 6, color: "var(--ink-secondary, #9aa3b2)" }}>
                {isZh ? "起始模块" : "Starting module"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border, rgba(255,255,255,0.14))", background: "rgba(255,255,255,0.02)", fontSize: 13 }}>
                {(() => {
                  const Icon = ICON_MAP[pendingModule.icon] ?? FileText;
                  return <Icon size={15} />;
                })()}
                {isZh ? pendingModule.titleZh : pendingModule.titleEn}
              </div>
            </div>

            <label style={{ display: "block", fontSize: 12.5, marginBottom: 18 }}>
              <span style={{ display: "block", marginBottom: 6, color: "var(--ink-secondary, #9aa3b2)" }}>
                {isZh ? "绑定 Universe（可选）" : "Bind a Universe (optional)"}
              </span>
              <select
                data-testid="project-universe-select"
                value={universeId}
                onChange={(event) => setUniverseId(event.target.value)}
                disabled={universeState === "loading"}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 9,
                  border: "1px solid var(--border, rgba(255,255,255,0.14))",
                  background: "rgba(255,255,255,0.04)",
                  color: "inherit",
                  fontSize: 13.5,
                }}
              >
                <option value="">{isZh ? "稍后绑定" : "Bind later"}</option>
                {universeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              {universeState === "error" ? (
                <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: 11.5, color: "var(--ink-secondary, #9aa3b2)" }}>
                  <Globe size={11} />
                  {isZh ? "Universe 列表暂时无法加载，可创建后在项目内绑定。" : "Universe list unavailable; bind later inside the project."}
                </span>
              ) : null}
            </label>

            {submitError ? (
              <div role="alert" style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.08)", fontSize: 12, color: "#f87171" }}>
                {submitError}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                data-testid="project-create-cancel"
                onClick={cancelPendingModule}
                disabled={pendingType !== null}
                style={{
                  padding: "8px 16px",
                  borderRadius: 9,
                  border: "1px solid var(--border, rgba(255,255,255,0.14))",
                  background: "transparent",
                  color: "inherit",
                  fontSize: 13,
                  cursor: pendingType === null ? "pointer" : "not-allowed",
                }}
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                data-testid="project-create-confirm"
                onClick={() => void handleStart(pendingModule.workType!, titleDraft, universeId)}
                disabled={pendingType !== null}
                style={{
                  padding: "8px 16px",
                  borderRadius: 9,
                  border: "none",
                  background: pendingType !== null ? "rgba(20,184,166,0.5)" : "#14B8A6",
                  color: "#04110f",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: pendingType === null ? "pointer" : "wait",
                }}
              >
                {pendingType !== null
                  ? isZh ? "创建中…" : "Creating…"
                  : isZh ? "确认创建" : "Create project"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
