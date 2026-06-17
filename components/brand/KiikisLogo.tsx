type KiikisLogoProps = {
  compact?: boolean;
  showTagline?: boolean;
  inline?: boolean;
};

export function KiikisLogo({ compact = false, showTagline = false, inline = false }: KiikisLogoProps) {
  if (inline) {
    return (
      <span className={`kiikis-logo kiikis-logo-inline ${compact ? "compact" : ""}`}>
        <svg
          className="kiikis-logo-glyph"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 9.5 L5 5.5 L8.4 8 M19 9.5 L19 5.5 L15.6 8" />
          <path d="M5 9.5 C5 16 8 19 12 19 C16 19 19 16 19 9.5" />
          <circle cx="9.4" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="14.6" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <path d="M12 14.4 L12 15.6" />
        </svg>
        <span className="kiikis-logo-word">kiikis</span>
      </span>
    );
  }

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
