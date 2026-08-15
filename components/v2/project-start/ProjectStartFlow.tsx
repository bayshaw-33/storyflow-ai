"use client";

/**
 * KIIKIS V2.2 Phase 0 — 项目入口（8 模块方格）。
 *
 * 删除 K2-T-03 的多步流程（内容类型/标题/Universe 关联/确认），
 * 改为直接渲染 WORK_TYPE_CARDS 八个顶级创作模块方格：
 *   - 同尺寸、同间距
 *   - 无自由输入区、无文件上传、无 novel 选项
 *   - 七个 V2 方格调用 startProject，改编方格复用既有改编工作台
 *   - 服务端返回的 workbenchRoute 直接用于导航（客户端不构造路由）
 *
 * 参见 PRD §5.1 与 Phase 0 Task 0.2。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileText,
  Flame,
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
import { startProject } from "@/lib/client/v2/project-start/api";
import {
  WORK_TYPE_CARDS,
  defaultTitleFor,
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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      // 无 Supabase 配置（如本地预览）：仍允许展示入口方格，
      // 但点击会因缺少 auth token 在 startProject 内抛 401。
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

  const handleStart = useCallback(
    async (workType: WorkType) => {
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
        // Idempotency-Key：每次点击生成新 UUID，重复点击在请求中并发时由服务端兜底。
        const idempotencyKey =
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const result = await startProject({
          workType,
          authToken,
          idempotencyKey,
          title: defaultTitleFor(workType),
        });
        // 服务端返回的 workbenchRoute 直接用于导航，客户端不构造路由。
        router.push(result.workbenchRoute);
      } catch (err) {
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
        ? "选择一个创作模块，系统会原子性地建立项目与对应工作台，Universe 可以后续绑定。"
        : "Pick a module — a project and its workbench are created atomically. Universe can be bound later.",
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

        {/* 8 模块方格：同尺寸、同间距 */}
        <section aria-label={isZh ? "创作模块" : "Creation modules"}>
          <div className={styles.moduleGrid}>
            {WORK_TYPE_CARDS.map((card) => {
              const Icon = ICON_MAP[card.icon] ?? FileText;
              const isPending = pendingType === card.workType;
              const disabled = pendingType !== null;
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`${styles.moduleCard} ${
                    isPending ? styles.moduleCardPending : ""
                  }`}
                  onClick={() => {
                    if (card.route) {
                      router.push(card.route);
                      return;
                    }
                    if (card.workType) void handleStart(card.workType);
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

        {submitError && (
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
    </main>
  );
}
