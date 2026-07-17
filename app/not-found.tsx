import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090b0c",
        color: "#edf1f0",
        display: "grid",
        placeContent: "center",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: "#7c8789", marginBottom: 12 }}>
          KIIKIS
        </p>
        <h1 style={{ fontSize: 56, fontWeight: 700, margin: "0 0 8px", color: "#79ddc8" }}>
          404
        </h1>
        <p style={{ fontSize: 15, color: "#aab3b4", margin: "0 0 4px" }}>
          没有找到这个页面
        </p>
        <p style={{ fontSize: 12, color: "#7c8789", margin: "0 0 24px" }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 40,
            padding: "0 18px",
            borderRadius: 6,
            background: "#eef3f1",
            color: "#111",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={16} />
          返回首页
        </Link>
      </div>
    </main>
  );
}
