import { redirect } from "next/navigation";

// 旧剧本入口 → 统一进入 V2.2 七模块入口。
export default function ScriptRedirect() {
  redirect("/projects/new-v2");
}
