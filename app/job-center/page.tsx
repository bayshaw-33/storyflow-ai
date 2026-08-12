"use client";

import { TaskCenter } from "@/components/v2/task-center/TaskCenter";

/**
 * /job-center 路由：跨工作台全局任务中心。
 * 1.0 仅按 projectId 分组展示简单列表；2.0 升级为统一任务模型，
 * 聚合全部工作台任务，支持阶段 / 耗时 / 预计区间 / 失败可执行动作，
 * 离开工作台后仍可独立查看。
 */
export default function JobCenterPage() {
  return <TaskCenter />;
}
