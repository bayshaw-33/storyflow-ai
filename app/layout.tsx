import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND_NAME, TAGLINE_EN } from "@/lib/brand";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { OSProvider } from "@/lib/os/uiState";
import { GlobalSideNav } from "@/components/layout/GlobalSideNav";
import { ThemeTimeSync } from "@/components/layout/ThemeTimeSync";
import { DevBridge } from "@/components/dev/DevBridge";
import { WorkspaceModalProvider } from "@/components/modal/workspace-modal-provider";
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
  title: "KIIKIS - AI Creative Workspace",
  description: TAGLINE_EN,
  applicationName: BRAND_NAME,
};

const themeBootScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("kiikis_theme_mode");
    const theme = stored === "dark" || stored === "light"
      ? stored
      : (new Date().getHours() >= 18 || new Date().getHours() < 7 ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
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
              <ThemeTimeSync />
              {children}
              <GlobalSideNav />
              <DevBridge />
            </WorkspaceModalProvider>
          </OSProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
