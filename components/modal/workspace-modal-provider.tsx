"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkspaceModal } from "@/components/modal/workspace-modal";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  clearWorkspaceModalPostLoginAction,
  WorkspaceModalContext,
  type WorkspaceModalApi,
} from "@/hooks/use-workspace-modal";

export function WorkspaceModalProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [open, setOpen] = useState(false);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    clearWorkspaceModalPostLoginAction();
    console.info("[PRD-001] Workspace modal opened from global provider; postLoginAction cleared.");
  }, [open]);

  const api = useMemo<WorkspaceModalApi>(
    () => ({
      open,
      openModal,
      closeModal,
      setOpen,
    }),
    [open, openModal, closeModal],
  );

  return (
    <WorkspaceModalContext.Provider value={api}>
      {children}
      <WorkspaceModal open={open} onClose={closeModal} isZh={isZh} />
    </WorkspaceModalContext.Provider>
  );
}
