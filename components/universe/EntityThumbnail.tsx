"use client";

type EntityThumbnailProps = {
  name: string;
  imageUrl?: string | null;
  size?: number;
};

export function EntityThumbnail({ name, imageUrl, size = 72 }: EntityThumbnailProps) {
  const frameStyle = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: 14,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    background: "var(--surface-2, #171a1a)",
    border: "1px solid var(--line, rgba(255,255,255,.12))",
  } as const;

  if (!imageUrl) {
    return <div style={frameStyle} aria-label={`${name} placeholder`}>{name.trim().slice(0, 1).toUpperCase() || "·"}</div>;
  }

  return (
    <div style={frameStyle}>
      {/* URLs come from authenticated project assets and vary by configured storage host. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

export function GenerateAppearanceButton({ isZh }: { isZh: boolean }) {
  return (
    <button className="secondary-button" type="button" disabled title={isZh ? "宇宙实体图像端点接入中" : "Universe entity image generation is coming soon"}>
      {isZh ? "生成形象 · 即将开放" : "Generate appearance · Soon"}
    </button>
  );
}
