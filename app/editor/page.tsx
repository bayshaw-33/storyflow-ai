import { Suspense } from "react";
import { EditorPageClient } from "./EditorPageClient";

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <EditorPageClient />
    </Suspense>
  );
}
