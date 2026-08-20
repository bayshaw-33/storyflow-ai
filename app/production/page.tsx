/**
 * /production - 统一四阶段制作台主入口
 *
 * 任务卡：KIIKIS-P1-TRAE-002
 *
 * 正式项目使用共享工作台查询参数：
 *   /production?projectId=<id>&workId=<id>&tab=script|art|storyboard|video&unitId=<stable-unit-id>
 * 新建草稿可以不携带 projectId，由制作台生成本地草稿上下文。
 *
 * 旧 /production-workbench 路由保留作为兼容入口，但不再扩展新功能。
 * 旧 /storyboard-workbench 路由不再扩展，仅保留迁移入口。
 *
 * 任务 4 修复：useSearchParams 要求 Suspense boundary，否则 build 时 prerender 失败。
 */

import { Suspense } from "react";
import { ProductionWorkbench } from "@/components/production/ProductionWorkbench";

export default function ProductionPage() {
  return (
    <Suspense fallback={null}>
      <ProductionWorkbench />
    </Suspense>
  );
}
