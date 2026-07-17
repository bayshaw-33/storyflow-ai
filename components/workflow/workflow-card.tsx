"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export type WorkflowTier = "core" | "extended";

export type WorkflowCardData = {
  id: string;
  title: string;
  description: string;
  href: string;
  tier?: WorkflowTier;
  icon: LucideIcon;
};

type WorkflowCardProps = {
  workflow: WorkflowCardData;
  onNavigate?: () => void;
};

export function WorkflowCard({ workflow, onNavigate }: WorkflowCardProps) {
  const Icon = workflow.icon;
  const className = [
    "workspace-workflow-card",
    workflow.tier === "core" ? "is-core" : "is-extended",
  ].filter(Boolean).join(" ");
  void workflow.tier;

  return (
    <Link className={className} href={workflow.href} onClick={onNavigate}>
      <span className="workspace-workflow-card-icon" aria-hidden="true"><Icon size={22} /></span>
      <span className="workspace-workflow-card-copy">
        <strong>{workflow.title}</strong>
        <small>{workflow.description}</small>
      </span>
      <span className="workspace-workflow-card-arrow" aria-hidden="true">
        <ArrowRight size={18} />
      </span>
    </Link>
  );
}
