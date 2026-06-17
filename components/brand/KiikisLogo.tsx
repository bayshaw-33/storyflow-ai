type KiikisLogoProps = {
  compact?: boolean;
  showTagline?: boolean;
};

// Single source of truth for the brand mark: cat-head + "kiikis" wordmark,
// rendered from the cleaned transparent PNG. Used everywhere the brand
// appears (nav, secondary page headers, pricing page, project workspace).
export function KiikisLogo({ compact = false, showTagline = false }: KiikisLogoProps) {
  const variant = showTagline ? "lockup" : "header";
  return (
    <span className={`kiikis-logo ${compact ? "compact" : ""} ${variant}`}>
      <img
        className="kiikis-logo-image"
        src={showTagline ? "/brand/kiikis-logo-lockup.png" : "/brand/kiikis-logo-header.png"}
        alt="kiikis"
      />
    </span>
  );
}
