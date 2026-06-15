type KiikisLogoProps = {
  compact?: boolean;
  showTagline?: boolean;
};

export function KiikisLogo({ compact = false, showTagline = false }: KiikisLogoProps) {
  return (
    <span className={compact ? "kiikis-logo compact" : "kiikis-logo"}>
      <img
        className="kiikis-logo-image"
        src={showTagline ? "/brand/kiikis-logo-lockup.png" : "/brand/kiikis-logo-header.png"}
        alt="kiikis"
      />
    </span>
  );
}
