import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoryFlow AI",
  description: "从创意到海外短剧剧本的 AI 创作工作台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
