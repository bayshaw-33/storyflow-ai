import type { Metadata } from "next";
import { BRAND_NAME, TAGLINE_EN } from "@/lib/brand";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: TAGLINE_EN,
  applicationName: BRAND_NAME,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
