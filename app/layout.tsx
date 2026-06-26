import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BRAND_NAME, TAGLINE_EN } from "@/lib/brand";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { OSProvider } from "@/lib/os/uiState";
import { KKProvider } from "@/components/kk/KKProvider";
import { GlobalSideNav } from "@/components/layout/GlobalSideNav";
import { DevBridge } from "@/components/dev/DevBridge";
import "./globals.css";

// Real Inter, self-hosted by Next.js at build time (no external request at
// runtime). Weight 300 powers the restrained, non-bold headings used
// everywhere outside the hero; 400/500/600 cover body text and emphasis.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KIIKIS - AI Creative Workspace",
  description: TAGLINE_EN,
  applicationName: BRAND_NAME,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <LanguageProvider>
          <OSProvider>
            <KKProvider>
              {children}
              <GlobalSideNav />
              <DevBridge />
            </KKProvider>
          </OSProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
