import { BRAND_NAME, TAGLINE_EN } from "@/lib/brand";
import { CatMark } from "@/components/brand/CatMark";

type KiikisLogoProps = {
  compact?: boolean;
  showTagline?: boolean;
};

export function KiikisLogo({ compact = false, showTagline = false }: KiikisLogoProps) {
  return (
    <span className={compact ? "kiikis-logo compact" : "kiikis-logo"}>
      <CatMark />
      <span className="kiikis-wordmark">{BRAND_NAME}</span>
      {showTagline ? <span className="kiikis-tagline">{TAGLINE_EN}</span> : null}
    </span>
  );
}
