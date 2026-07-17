/**
 * Visible Disclosure Composer (server-side).
 *
 * Disclosure copy lives HERE, not in UI components, so every export surface
 * (download headers, sidecar files, future player UI) renders the same
 * legally reviewed bilingual text.
 *
 * Pixel-level watermarking is post-Phase-0: mode "watermark" is reported as
 * supported=false so strict jurisdictions treat disclosure as NOT satisfied.
 */

import type { AiManifest, JurisdictionProfile, VisibleDisclosureMode } from "./types.ts";

export interface DisclosurePayload {
  headline: string;
  body: string;
  min_duration_seconds?: number;
}

export interface DisclosureResult {
  applied: boolean;
  mode: VisibleDisclosureMode;
  supported: boolean;
  payload?: DisclosurePayload;
}

const DISCLOSURE_COPY: Record<JurisdictionProfile, { headline: string; body: string }> = {
  EU_ART50: {
    headline: "AI-generated content / 人工智能生成内容",
    body:
      "This content was generated or modified with AI assistance. It is marked and disclosed in accordance " +
      "with EU AI Act Article 50 (transparency obligations for synthetic content).\n" +
      "本内容由人工智能生成或修改，已按照欧盟《人工智能法》第 50 条（合成内容透明度义务）添加机器可读标识并进行披露。",
  },
  CN_AIGC: {
    headline: "人工智能生成合成内容标识 / AI-Generated Content Label",
    body:
      "本内容由人工智能生成或修改，已依据《人工智能生成合成内容标识办法》添加显式标识，并在文件元数据中写入隐式标识。\n" +
      "This content was generated or modified by AI. Explicit and embedded metadata labels are applied in accordance " +
      "with the Measures for Labeling AI-Generated Synthetic Content (effective 2025-09-01).",
  },
  EU_CN_DUAL: {
    headline: "AI-generated content / 人工智能生成合成内容",
    body:
      "This content was generated or modified with AI assistance and is disclosed under EU AI Act Article 50 " +
      "and the China Measures for Labeling AI-Generated Synthetic Content.\n" +
      "本内容由人工智能生成或修改，已同时按照欧盟《人工智能法》第 50 条与《人工智能生成合成内容标识办法》进行标识与披露。",
  },
  INTERNAL_ONLY: {
    headline: "Internal AI-assisted draft / 内部 AI 辅助草稿",
    body:
      "Internal AI-assisted draft. Not reviewed for external distribution.\n" +
      "内部 AI 辅助草稿，未经外发审核，请勿对外分发。",
  },
};

export function composeVisibleDisclosure(
  manifest: AiManifest,
  mode: VisibleDisclosureMode,
  profile: JurisdictionProfile,
): DisclosureResult {
  if (mode === "watermark") {
    // Pixel watermarking is post-Phase-0. The gate must treat this as
    // disclosure NOT satisfied for strict (EU/CN) profiles.
    return { applied: false, mode, supported: false };
  }

  if (mode === "none") {
    // Valid only for INTERNAL_ONLY exports; strict profiles must not pass with "none".
    return { applied: profile === "INTERNAL_ONLY", mode, supported: true };
  }

  const copy = DISCLOSURE_COPY[profile] ?? DISCLOSURE_COPY.INTERNAL_ONLY;

  if (mode === "end_card") {
    return {
      applied: true,
      mode,
      supported: true,
      payload: {
        headline: copy.headline,
        body: copy.body,
        min_duration_seconds: 3,
      },
    };
  }

  if (mode === "credits") {
    return {
      applied: true,
      mode,
      supported: true,
      payload: {
        headline: `Credits — ${copy.headline}`,
        body:
          `${copy.body}\n` +
          `Platform: ${manifest.platform} · Provider: ${manifest.provider_code} · Content-ID: ${manifest.content_id}`,
      },
    };
  }

  // mode === "ui"
  return {
    applied: true,
    mode,
    supported: true,
    payload: { headline: copy.headline, body: copy.body },
  };
}
