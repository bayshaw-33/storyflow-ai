import type { Metadata } from "next";
import { BRAND_NAME, TAGLINE_EN } from "@/lib/brand";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { OSProvider } from "@/lib/os/uiState";
import { KKProvider } from "@/components/kk/KKProvider";
import { GlobalSideNav } from "@/components/layout/GlobalSideNav";
import { DevBridge } from "@/components/dev/DevBridge";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: TAGLINE_EN,
  applicationName: BRAND_NAME,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
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
