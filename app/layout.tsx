import type { Metadata } from "next";
import { BRAND_NAME, LEGACY_ENGINE_NAME, TAGLINE_EN } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: TAGLINE_EN,
  applicationName: `${BRAND_NAME} powered by ${LEGACY_ENGINE_NAME}`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
