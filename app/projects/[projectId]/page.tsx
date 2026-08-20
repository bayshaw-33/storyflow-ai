import { redirect } from "next/navigation";
import { buildUnifiedWorkbenchUrl } from "@/lib/contracts/v2/unified-workbench";

// 旧 WorkflowPage → 进入当前三栏剧本创作台。
// 页面可经 git 历史与本机备份 (.backups/old-script-workbench-20260718.tar.gz) 恢复
export default async function ProjectRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(buildUnifiedWorkbenchUrl({ projectId, tab: "script" }));
}
