"use client";

import { Suspense } from "react";
import { SongVoiceLibrary } from "@/components/song-workbench/SongVoiceLibrary";

export default function SongVoicesPage() {
  return (
    <Suspense fallback={<main className="song-product-page"><div className="song-product-loading">加载音乐音色库…</div></main>}>
      <SongVoiceLibrary />
    </Suspense>
  );
}
