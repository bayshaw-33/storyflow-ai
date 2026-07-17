import { Suspense } from "react";
import { ProductionWorkbench } from "@/components/production/ProductionWorkbench";

export default function ProductionWorkbenchPage() {
  return (
    <Suspense fallback={null}>
      <ProductionWorkbench />
    </Suspense>
  );
}
