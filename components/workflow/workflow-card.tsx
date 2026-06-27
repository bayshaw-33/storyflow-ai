"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export type WorkflowStatus = "active" | "coming_soon";
export type WorkflowTier = "core" | "extended";

export type WorkflowCardData = {
  id: string;
  title: string;
  description: string;
  href: string;
  status: WorkflowStatus;
  tier: WorkflowTier;
  icon: LucideIcon;
};

type WorkflowCardProps = {
  workflow: WorkflowCardData;
  onNavigate?: () => void;
};

const comingSoonText = "Coming in Phase 0 Q2";

export function WorkflowCard({ workflow, onNavigate }: WorkflowCardProps) {
  const Icon = workflow.icon;
  const className = [
    "workspace-workflow-card",
    workflow.tier === "core" ? "is-core" : "is-extended",
    workflow.status === "coming_soon" ? "is-coming-soon" : "",
  ].filter(Boolean).join(" ");

  const content = (
    <>
      <span className="workspace-workflow-card-icon" aria-hidden="true"><Icon size={22} /></span>
      <span className="workspace-workflow-card-copy">
        <strong>{workflow.title}</strong>
        <small>{workflow.description}</small>
      </span>
      <span className="workspace-workflow-card-arrow" aria-hidden="true">
        {workflow.status === "active" ? <ArrowRight size={18} /> : null}
      </span>
    </>
  );

  if (workflow.status === "coming_soon") {
    return (
      <button
        type="button"
        className={className}
        title={comingSoonText}
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          console.info(`[PRD-001] ${workflow.id} is disabled: ${comingSoonText}`);
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <Link className={className} href={workflow.href} onClick={onNavigate}>
      {content}
    </Link>
  );
}
