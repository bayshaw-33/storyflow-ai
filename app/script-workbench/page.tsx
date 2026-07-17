import { redirect } from "next/navigation";

// 旧剧本入口 → 合并到创作工作台（novel-workbench，Screenplay Tab）
export default function ScriptWorkbenchRedirect() {
  redirect("/novel-workbench?new=1&setup=1&mode=screenplay");
}
