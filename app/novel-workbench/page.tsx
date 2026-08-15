import { redirect } from "next/navigation";

/**
 * 小说工作台已退役。
 * 旧项目链接仍尝试进入当前剧本适配器；没有项目上下文时回到 V2.2 模块入口。
 */
export default async function RetiredNovelWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const projectId = typeof params.projectId === "string" ? params.projectId : null;
  redirect(projectId ? `/script-workbench?projectId=${encodeURIComponent(projectId)}` : "/projects/new-v2");
}
