"use client";

import type { ReactNode } from "react";
import { GravitySystem } from "@/components/companion/GravitySystem";
import { ControlLayer } from "@/components/universe/ControlLayer";
import { CreativeField } from "@/components/universe/CreativeField";
import { FutureLayer } from "@/components/universe/FutureLayer";
import { GravityProvider } from "@/lib/gravity/GravityContext";
import { OrbitProvider } from "@/lib/orbit/OrbitContext";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <GravityProvider>
      <OrbitProvider>
        <div className="kk-app-shell" data-system="creative-universe-interface">
          <GravitySystem />
          <CreativeField>{children}</CreativeField>
          <ControlLayer />
          <FutureLayer />
        </div>
      </OrbitProvider>
    </GravityProvider>
  );
}
