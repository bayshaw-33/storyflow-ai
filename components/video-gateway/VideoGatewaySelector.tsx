/**
 * TRAE-V2-05 Video Model Gateway V1
 * 模型选择 UI 组件
 *
 * - 调用 /api/video-gateway/catalog 获取可用 provider
 * - Auto / Atlas / MiniMax / Runway / Seedance
 * - 不可用的 provider 显示禁用状态 + 原因
 * - 不显示 API Key、Secret 或内部端点
 */

"use client";

import { memo, useCallback, useEffect, useState } from "react";

export type ProviderCatalogEntry = {
  name: "atlas" | "minimax" | "runway" | "seedance";
  displayName: string;
  description: string;
  capabilities: string[];
  available: boolean;
  unavailableReason?: string;
  defaultModel: string;
  tags: string[];
};

type Props = {
  accessToken: string | null;
  value: "auto" | ProviderCatalogEntry["name"];
  onChange: (value: "auto" | ProviderCatalogEntry["name"]) => void;
  isZh?: boolean;
  disabled?: boolean;
};

const COPY = {
  zh: {
    title: "视频模型",
    auto: "自动",
    autoDesc: "由 Gateway 根据可用性自动选择",
    unavailable: "暂不可用",
    loading: "加载中…",
    error: "获取模型列表失败",
    retry: "重试",
  },
  en: {
    title: "Video Model",
    auto: "Auto",
    autoDesc: "Gateway routes to the first available provider",
    unavailable: "Unavailable",
    loading: "Loading…",
    error: "Failed to load catalog",
    retry: "Retry",
  },
};

export const VideoGatewaySelector = memo(function VideoGatewaySelector({
  accessToken,
  value,
  onChange,
  isZh = true,
  disabled = false,
}: Props) {
  const copy = isZh ? COPY.zh : COPY.en;
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/video-gateway/catalog", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "fetch failed");
      }
      setCatalog(data.catalog as ProviderCatalogEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const availableCount = catalog.filter((e) => e.available).length;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        background: "rgba(255,255,255,0.02)",
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{copy.title}</span>
        {loading ? (
          <span style={{ fontSize: 11 }}>{copy.loading}</span>
        ) : error ? (
          <button
            type="button"
            onClick={() => void loadCatalog()}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,180,120,0.9)",
              fontSize: 11,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {copy.retry}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {availableCount}/{catalog.length}
          </span>
        )}
      </div>

      {error ? (
        <div style={{ fontSize: 11, color: "rgba(255,120,120,0.8)" }}>
          {copy.error}: {error}
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label={copy.title}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          {/* Auto 选项 */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 6,
              cursor: disabled ? "not-allowed" : "pointer",
              background:
                value === "auto"
                  ? "rgba(120,180,255,0.08)"
                  : "transparent",
              border:
                value === "auto"
                  ? "1px solid rgba(120,180,255,0.3)"
                  : "1px solid transparent",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <input
              type="radio"
              name="video-provider"
              value="auto"
              checked={value === "auto"}
              disabled={disabled}
              onChange={() => onChange("auto")}
              style={{ marginTop: 2 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 500,
                }}
              >
                {copy.auto}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  marginTop: 2,
                }}
              >
                {copy.autoDesc}
              </div>
            </div>
          </label>

          {/* 具体 Provider */}
          {catalog.map((entry) => {
            const isSelected = value === entry.name;
            const isDisabled = disabled || !entry.available;
            return (
              <label
                key={entry.name}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  background: isSelected
                    ? "rgba(120,180,255,0.08)"
                    : "transparent",
                  border: isSelected
                    ? "1px solid rgba(120,180,255,0.3)"
                    : "1px solid transparent",
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <input
                  type="radio"
                  name="video-provider"
                  value={entry.name}
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => onChange(entry.name)}
                  style={{ marginTop: 2 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.9)",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>{entry.displayName}</span>
                    {!entry.available && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "rgba(255,180,120,0.15)",
                          color: "rgba(255,180,120,0.9)",
                        }}
                      >
                        {copy.unavailable}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.5)",
                      marginTop: 2,
                    }}
                  >
                    {entry.description}
                  </div>
                  {entry.tags.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 4,
                      }}
                    >
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: "rgba(255,255,255,0.05)",
                            color: "rgba(255,255,255,0.5)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
});
