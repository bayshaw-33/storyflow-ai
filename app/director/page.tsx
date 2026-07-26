/**
 * TRAE-V2-04 AI Director 入口页面
 */

import { Suspense } from "react";
import { DirectorPageClient } from "./DirectorPageClient";

export const dynamic = "force-dynamic";

export default function DirectorPage() {
  return (
    <Suspense fallback={null}>
      <DirectorPageClient />
    </Suspense>
  );
}
