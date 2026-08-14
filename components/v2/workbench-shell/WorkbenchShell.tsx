"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type {
  ContextSwitchType,
  WorkbenchAdapter,
} from "@/lib/client/v2/workbench/types";
import {
  getUnsavedWarningMessage,
  shouldWarnOnContextSwitch,
} from "@/lib/client/v2/workbench/unsaved-guard";
import { bindWorkToUniverse } from "@/lib/client/v2/universe/api";
import type { BindWorkToUniverseInput } from "@/lib/client/v2/universe/types";
import { TopBar } from "./TopBar";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { TaskBar } from "./TaskBar";
import { ContentArea } from "./ContentArea";
import { UnsavedConfirmDialog } from "./UnsavedConfirmDialog";
import { UniverseBindingDialog } from "./UniverseBindingDialog";
import { VersionActions } from "./VersionActions";
import { EvidenceActions } from "./EvidenceActions";
import styles from "./workbench-shell.module.css";

export interface WorkbenchShellProps {
  adapter: WorkbenchAdapter;
}

/**
 * 统一工作台外壳。
 *
 * 由顶部栏 + 左侧栏 + 中间区 + 右侧栏 + 底部任务浮层组成。
 * 各工作台通过 WorkbenchAdapter 注入数据与回调，外壳负责统一呈现。
 * 不修改既有工作台入口，各工作台可逐个接入。
 *
 * 响应式：
 * - 桌面（≥1024px）：四栏并排
 * - 平板（640-1023px）：侧栏收起为抽屉
 * - 移动端（<640px）：单列，优先查看/确认/任务管理
 */
export function WorkbenchShell({ adapter }: WorkbenchShellProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const router = useRouter();

  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  // 未保存提醒状态
  const [pendingSwitch, setPendingSwitch] = useState<{
    type: ContextSwitchType;
    action: () => void;
  } | null>(null);
  // Phase 2 Task 2.5: Universe 绑定对话框状态（不自动弹窗，用户点击才打开）
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);

  // Phase 2 Task 2.5: 绑定 Work 到 Universe（调用 V22 原子绑定 API）。
  const handleBindUniverse = useCallback(
    async (input: BindWorkToUniverseInput) => {
      if (!adapter.workId) {
        throw new Error(isZh ? "缺少 Work 身份，无法绑定" : "Missing Work identity");
      }
      await bindWorkToUniverse(adapter.workId, input);
      // 绑定成功后刷新页面以加载新 Manifest 状态。
      router.refresh();
    },
    [adapter.workId, isZh, router],
  );

  // Phase 2 Task 2.5: 打开 Universe 工作台。
  const handleOpenUniverse = useCallback(() => {
    if (adapter.universeBinding.universeId) {
      router.push(`/universes/${adapter.universeBinding.universeId}`);
    }
  }, [adapter.universeBinding.universeId, router]);

  // Phase 2 Task 2.5: 查看继承详情（跳转到 Work 继承页）。
  const handleViewInheritance = useCallback(() => {
    if (adapter.workId) {
      router.push(`/works/${adapter.workId}/inheritance`);
    }
  }, [adapter.workId, router]);

  // Phase 2 Task 2.5: 同步到最新 Universe Version（跳转到 diff/adopt 页）。
  const handleSyncUniverse = useCallback(() => {
    if (adapter.workId) {
      router.push(`/works/${adapter.workId}/inheritance?action=sync`);
    }
  }, [adapter.workId, router]);

  // Phase 2 Task 2.5: 创建新 Universe（跳转 /universes/new）。
  const handleCreateUniverse = useCallback(() => {
    router.push("/universes/new");
  }, [router]);

  // 上下文切换守卫：若存在未保存修改，先弹确认对话框。
  const guardContextSwitch = useCallback(
    (type: ContextSwitchType, action: () => void) => {
      if (shouldWarnOnContextSwitch(adapter.saveStatus)) {
        setPendingSwitch({ type, action });
      } else {
        action();
      }
    },
    [adapter.saveStatus],
  );

  // 步骤切换：经过未保存守卫。
  const handleStepChange = useCallback(
    (stepId: string) => {
      guardContextSwitch("stage", () => {
        void adapter.onStepChange(stepId);
      });
    },
    [adapter, guardContextSwitch],
  );

  // 确认切换
  const confirmSwitch = useCallback(() => {
    if (pendingSwitch) {
      pendingSwitch.action();
    }
    setPendingSwitch(null);
  }, [pendingSwitch]);

  // 取消切换
  const cancelSwitch = useCallback(() => {
    setPendingSwitch(null);
  }, []);

  const pendingMessage = pendingSwitch
    ? getUnsavedWarningMessage(adapter.saveStatus, pendingSwitch.type, locale)
    : "";

  // 平板/移动端侧栏抽屉内容
  const renderDrawerPanel = (side: "left" | "right"): ReactNode => {
    const panel =
      side === "left" ? (
        <LeftPanel
          steps={adapter.steps}
          currentStep={adapter.currentStep}
          assets={adapter.assets}
          locale={locale}
          onStepChange={(stepId) => {
            handleStepChange(stepId);
            setLeftDrawerOpen(false);
          }}
        />
      ) : (
        <RightPanel
          aiContext={adapter.aiContext}
          modelSettings={adapter.modelSettings}
          locale={locale}
        />
      );
    return (
      <>
        <div className={side === "left" ? styles.drawerLeft : styles.drawerRight}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={isZh ? "关闭" : "Close"}
            style={{ margin: 12, alignSelf: "flex-end" }}
            onClick={() => (side === "left" ? setLeftDrawerOpen(false) : setRightDrawerOpen(false))}
          >
            <X size={16} />
          </button>
          {panel}
        </div>
        <div
          className={styles.drawerOverlay}
          onClick={() => (side === "left" ? setLeftDrawerOpen(false) : setRightDrawerOpen(false))}
        />
      </>
    );
  };

  // Phase 1 Task 1.5: 无 workId 时显示阻断错误，禁止本地假保存
  const hasWorkId = Boolean(adapter.workId);

  return (
    <div className={styles.shell}>
      <style>{`@keyframes tc-spin { to { transform: rotate(360deg); } } .tc-spin { animation: tc-spin 1s linear infinite; }`}</style>
      <TopBar
        project={adapter.project}
        universeBinding={adapter.universeBinding}
        saveStatus={adapter.saveStatus}
        locale={locale}
        onOpenLeftPanel={() => setLeftDrawerOpen(true)}
        onOpenRightPanel={() => setRightDrawerOpen(true)}
        onCreateUniverse={hasWorkId ? handleCreateUniverse : undefined}
        onBindExisting={hasWorkId ? () => setBindingDialogOpen(true) : undefined}
        onOpenUniverse={hasWorkId ? handleOpenUniverse : undefined}
        onViewInheritance={hasWorkId ? handleViewInheritance : undefined}
        onSyncUniverse={hasWorkId ? handleSyncUniverse : undefined}
      />
      {hasWorkId && (
        <div className={styles.versionBar}>
          <VersionActions
            workId={adapter.workId}
            currentVersionId={adapter.currentVersionId}
            latestCheckpointId={adapter.latestCheckpointId}
            finalizedVersionId={adapter.finalizedVersionId}
            locale={locale}
            onCreateCheckpoint={adapter.onCreateCheckpoint}
            onFinalize={adapter.onFinalize}
          />
          <EvidenceActions
            workId={adapter.workId}
            locale={locale}
            onDownloadEvidence={adapter.onDownloadEvidence}
          />
        </div>
      )}
      {!hasWorkId && (
        <div className={styles.blockingError} role="alert">
          {isZh
            ? "当前作品未关联 Work 身份，无法保存或生成。请从工作流入口重新进入。"
            : "This work has no Work identity. Saving and generation are blocked. Please re-enter from the workflow entry."}
        </div>
      )}
      <div className={styles.body}>
        <LeftPanel
          steps={adapter.steps}
          currentStep={adapter.currentStep}
          assets={adapter.assets}
          locale={locale}
          onStepChange={handleStepChange}
        />
        <ContentArea>{adapter.workbenchContent}</ContentArea>
        <RightPanel
          aiContext={adapter.aiContext}
          modelSettings={adapter.modelSettings}
          locale={locale}
        />
      </div>
      <TaskBar jobs={adapter.runningJobs} locale={locale} />

      {leftDrawerOpen && renderDrawerPanel("left")}
      {rightDrawerOpen && renderDrawerPanel("right")}

      {pendingSwitch && (
        <UnsavedConfirmDialog
          message={pendingMessage}
          locale={locale}
          onConfirm={confirmSwitch}
          onCancel={cancelSwitch}
        />
      )}

      {/* Phase 2 Task 2.5: Universe 绑定对话框（仅 workId 存在时可打开） */}
      {hasWorkId && (
        <UniverseBindingDialog
          workId={adapter.workId as string}
          open={bindingDialogOpen}
          onClose={() => setBindingDialogOpen(false)}
          onConfirm={handleBindUniverse}
        />
      )}
    </div>
  );
}
