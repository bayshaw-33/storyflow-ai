"use client";

import { Suspense } from "react";
import { VoiceWorkbench } from "@/components/v2/voice-workbench/VoiceWorkbench";

export default function VoiceWorkbenchPage() {
  return (
    <main className="cosmic-page" style={{ minHeight: "100vh" }}>
      <Suspense fallback={<div style={{ padding: 40 }}>加载配音工作台…</div>}>
        <VoiceWorkbench />
      </Suspense>
    </main>
  );
}
