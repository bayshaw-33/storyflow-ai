import { redirect } from "next/navigation";

/** 小说工作台已退役，旧 URL 不再把任何项目送入剧本台。 */
export default function RetiredNovelWorkbenchPage() {
  redirect("/projects/new-v2");
}
