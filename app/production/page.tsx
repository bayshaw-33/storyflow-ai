/**
 * /production — 第一阶段分镜制作台主入口
 *
 * 任务卡：KIIKIS-P1-TRAE-002
 *
 * 必须携带 projectId + sourceUnitId 两个查询参数：
 *   /production?projectId=<id>&sourceUnitId=<stable-unit-id>
 *
 * 旧 /production-workbench 路由保留作为兼容入口，但不再扩展新功能。
 * 旧 /storyboard-workbench 路由不再扩展，仅保留迁移入口。
 */

import { ProductionWorkbench } from "@/components/production/ProductionWorkbench";

export default function ProductionPage() {
  return <ProductionWorkbench />;
}
