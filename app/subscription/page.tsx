"use client";

import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { MonetizationLayer } from "@/components/pricing/MonetizationLayer";

export default function SubscriptionPage() {
  return (
    <main className="kk-monetization-os">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>
      <MonetizationLayer />
    </main>
  );
}
