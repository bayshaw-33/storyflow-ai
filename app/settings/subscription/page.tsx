"use client";

import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { MonetizationLayer } from "@/components/pricing/MonetizationLayer";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { useI18n } from "@/lib/i18n/useI18n";

/**
 * /settings/subscription
 * 套餐管理：复用 MonetizationLayer（与 /subscription 共用），包裹在 SettingsTabs 中。
 */
export default function SettingsSubscriptionPage() {
  const { t } = useI18n();
  return (
    <main className="cosmic-page settings-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>{t("settings.kicker")}</span>
        <h1>{t("settings.subscription")}</h1>
      </section>

      <SettingsTabs activeTab="subscription">
        <MonetizationLayer />
      </SettingsTabs>
    </main>
  );
}
