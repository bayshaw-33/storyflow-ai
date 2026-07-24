import { redirect } from "next/navigation";

/**
 * /settings → 重定向到 /settings/profile
 * 旧入口保留兼容性，新结构按 Tab 拆分为 /settings/profile | /settings/api | /settings/subscription
 */
export default function SettingsRedirect() {
  redirect("/settings/profile");
}
