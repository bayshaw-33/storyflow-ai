import { redirect } from "next/navigation";

export default function ScriptWorkbenchRedirectPage() {
  redirect("/dashboard?workflow=script&setup=1");
}
