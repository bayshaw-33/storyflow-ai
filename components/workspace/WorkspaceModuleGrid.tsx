"use client";

import { memo, useCallback } from "react";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { WORKSPACE_MODULES, type AssetToken, type WorkspaceModuleId } from "@/lib/design/manifest";

type WorkspaceModuleGridProps = {
  onSelectModule?: (id: WorkspaceModuleId) => void;
};

type WorkspaceModuleButtonProps = {
  id: WorkspaceModuleId;
  token: AssetToken;
  label: string;
  onSelect?: (id: WorkspaceModuleId) => void;
};

const WorkspaceModuleButton = memo(function WorkspaceModuleButton({
  id,
  token,
  label,
  onSelect,
}: WorkspaceModuleButtonProps) {
  const handleClick = useCallback(() => onSelect?.(id), [id, onSelect]);

  return (
    <button
      type="button"
      className="workspace-module-card"
      data-module={id}
      aria-label={label}
      onClick={handleClick}
    >
      <DesignAssetImage token={token} alt={label} draggable={false} />
    </button>
  );
});

export const WorkspaceModuleGrid = memo(function WorkspaceModuleGrid({
  onSelectModule,
}: WorkspaceModuleGridProps) {
  return (
    <section className="workspace-module-grid" aria-label="Workspace modules">
      {WORKSPACE_MODULES.map(({ id, token, label }) => (
        <WorkspaceModuleButton
          key={id}
          id={id}
          token={token}
          label={label}
          onSelect={onSelectModule}
        />
      ))}
    </section>
  );
});
