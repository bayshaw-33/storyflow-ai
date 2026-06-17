"use client";

import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { MonetizationLayer } from "@/components/pricing/MonetizationLayer";

export default function SubscriptionPage() {
  return (
    <main className="kk-monetization-os">
      <Link href="/" className="kk-monetization-brand" aria-label="Home">
        <KiikisLogo compact />
      </Link>
      <MonetizationLayer />
    </main>
  );
}
