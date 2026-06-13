import type { ReactNode } from "react";

export function CreativeField({ children }: { children: ReactNode }) {
  return (
    <div className="kk-creative-field" data-layer="creative-field">
      {children}
    </div>
  );
}
