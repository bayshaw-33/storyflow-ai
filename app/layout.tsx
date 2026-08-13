import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND_NAME, TAGLINE_EN } from "@/lib/brand";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { OSProvider } from "@/lib/os/uiState";
import { GlobalSideNav } from "@/components/layout/GlobalSideNav";
import { ThemeTimeSync } from "@/components/layout/ThemeTimeSync";
import { DevBridge } from "@/components/dev/DevBridge";
import { WorkspaceModalProvider } from "@/components/modal/workspace-modal-provider";
import { KkRuntimeProvider } from "@/components/v2/kk/KkRuntimeProvider";
import { KkCompanion } from "@/components/v2/kk/KkCompanion";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KIIKIS — The Universe-First Creative Workbench",
  description: TAGLINE_EN,
  applicationName: BRAND_NAME,
  openGraph: {
    title: "KIIKIS — The Universe-First Creative Workbench",
    description: TAGLINE_EN,
    siteName: "KIIKIS",
  },
};

const themeBootScript = `
(() => {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <LanguageProvider>
          <OSProvider>
            <WorkspaceModalProvider>
              <KkRuntimeProvider allowFixtureFallback>
                <ThemeTimeSync />
                {children}
                <GlobalSideNav />
                <KkCompanion />
                <DevBridge />
              </KkRuntimeProvider>
            </WorkspaceModalProvider>
          </OSProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
