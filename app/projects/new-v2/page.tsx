"use client";

// K2-T-03 渐进式项目创建 · 2.0 入口页
// 独立于 1.0 wizard（app/projects/[projectId]/page.tsx），不修改既有逻辑。

import { ProjectStartFlow } from "@/components/v2/project-start/ProjectStartFlow";

export default function NewV2ProjectPage() {
  return <ProjectStartFlow />;
}
