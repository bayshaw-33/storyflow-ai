import { redirect } from "next/navigation";

// 任务 2：美术工作台合并入制作工作台美术 Tab
// /art-workbench 301 由 next.config.ts 接管；此文件作为兜底（如 301 未命中）
export default function ArtWorkbenchRedirect() {
  redirect("/production?mode=art");
}
