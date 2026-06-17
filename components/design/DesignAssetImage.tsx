"use client";

import { memo, type ImgHTMLAttributes } from "react";
import { assetUrl, isHeroPriorityAsset, type AssetToken } from "@/lib/design/manifest";
import { traceAsset } from "@/lib/dev/trace";

type DesignAssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "loading" | "decoding"> & {
  token: AssetToken;
  priority?: boolean;
};

// Central asset renderer. Every design asset flows through here, so asset
// usage is never implicit — each rendered asset is tagged with data-asset and
// its load/error is traced (dev only).
export const DesignAssetImage = memo(function DesignAssetImage({
  token,
  priority,
  alt,
  ...props
}: DesignAssetImageProps) {
  const isPriority = priority ?? isHeroPriorityAsset(token);

  return (
    <img
      {...props}
      src={assetUrl(token)}
      alt={alt ?? ""}
      data-asset={token}
      loading={isPriority ? "eager" : "lazy"}
      decoding={isPriority ? "sync" : "async"}
      fetchPriority={isPriority ? "high" : "low"}
      onLoad={() => traceAsset(token, "loaded")}
      onError={() => traceAsset(token, "error")}
    />
  );
});
