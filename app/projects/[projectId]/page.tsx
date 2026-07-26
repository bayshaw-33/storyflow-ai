import { redirect } from "next/navigation";

// 旧 WorkflowPage → 合并到创作工作台（novel-workbench）
// 页面可经 git 历史与本机备份 (.backups/old-script-workbench-20260718.tar.gz) 恢复
export default async function ProjectRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/novel-workbench?projectId=${encodeURIComponent(projectId)}`);
}
