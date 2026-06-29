import { redirect } from "next/navigation";

export default function DramaWorkbenchRedirectPage() {
  redirect("/dashboard?workflow=script&setup=1");
}
