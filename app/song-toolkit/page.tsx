"use client";

import { Suspense } from "react";
import { SongToolkit } from "@/components/song-workbench/SongToolkit";

export default function SongToolkitPage() {
  return (
    <Suspense fallback={<main className="song-product-page"><div className="song-product-loading">加载音乐工具箱…</div></main>}>
      <SongToolkit />
    </Suspense>
  );
}
