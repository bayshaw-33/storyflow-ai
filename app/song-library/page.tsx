"use client";

import { Suspense } from "react";
import { SongLibraryClient } from "@/components/song-workbench/SongLibraryClient";

export default function SongLibraryPage() {
  return (
    <Suspense fallback={<main className="song-product-page"><div className="song-product-loading">加载音乐作品…</div></main>}>
      <SongLibraryClient />
    </Suspense>
  );
}
