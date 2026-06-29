"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { InputBox } from "@/components/modal/input-box";
import { WorkflowGrid } from "@/components/workflow/workflow-grid";

type WorkspaceModalProps = {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function WorkspaceModal({ open, onClose, isZh }: WorkspaceModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      firstFocusable?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((node) => !node.hasAttribute("disabled") && node.getAttribute("aria-disabled") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    console.info("[PRD-001] Workspace modal mounted and focus trap enabled.");

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="workspace-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="workspace-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-modal-title"
        ref={dialogRef}
      >
        <header className="workspace-modal-header">
          <div>
            <span>{isZh ? "KIIKIS 工作台" : "KIIKIS Workspace"}</span>
            <h2 id="workspace-modal-title">{isZh ? "选择创作入口" : "Choose a workflow"}</h2>
          </div>
          <button type="button" className="workspace-modal-close" onClick={onClose} aria-label={isZh ? "关闭" : "Close"}>
            <X size={20} />
          </button>
        </header>

        <InputBox isZh={isZh} onNavigate={onClose} />

        <section className="workspace-modal-workflows">
          <div className="workspace-modal-section-head">
            <span>{isZh ? "核心工作流优先" : "Core workflows first"}</span>
            <small>{isZh ? "选择一个入口开始创作" : "Choose an entry point to start creating"}</small>
          </div>
          <WorkflowGrid isZh={isZh} onNavigate={onClose} />
        </section>
      </section>
    </div>,
    document.body,
  );
}
