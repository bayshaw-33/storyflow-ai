import { redirect } from "next/navigation";

// 旧 WorkflowPage → 合并到创作工作台（novel-workbench）
// 页面可经 git 历史与本机备份 (.backups/old-script-workbench-20260718.tar.gz) 恢复
export default function ProjectRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  void params.then((p) => {
    redirect(`/novel-workbench?projectId=${encodeURIComponent(p.projectId)}`);
  });
  return null;
}
