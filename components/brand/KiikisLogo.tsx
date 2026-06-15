type KiikisLogoProps = {
  compact?: boolean;
  showTagline?: boolean;
};

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
