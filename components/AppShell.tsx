"use client";

import type { ReactNode } from "react";
import { GravitySystem } from "@/components/companion/GravitySystem";
import { ControlLayer } from "@/components/universe/ControlLayer";
import { CreativeField } from "@/components/universe/CreativeField";
import { FutureLayer } from "@/components/universe/FutureLayer";
import { IPUniverseLayer } from "@/components/universe/IPUniverseLayer";
import { UniverseBackground } from "@/components/universe/UniverseBackground";
import { GravityProvider } from "@/lib/gravity/GravityContext";
import { IPUniverseProvider } from "@/lib/ip/IPUniverseContext";
import { OrbitProvider } from "@/lib/orbit/OrbitContext";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <GravityProvider>
      <OrbitProvider>
        <IPUniverseProvider>
          <div className="kk-app-shell" data-system="creative-universe-interface">
            <UniverseBackground />
            <GravitySystem />
            <CreativeField>{children}</CreativeField>
            <IPUniverseLayer />
            <ControlLayer />
            <FutureLayer />
          </div>
        </IPUniverseProvider>
      </OrbitProvider>
    </GravityProvider>
  );
}
