"use client";

import { Suspense } from "react";
import { CreationWorkbench } from "@/components/creation/CreationWorkbench";

export default function CreationWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page novel-workbench-page" />}>
      <CreationWorkbench />
    </Suspense>
  );
}
