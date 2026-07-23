/**
 * POST /api/song/delivery-package/sign
 *
 * Kiikis 歌曲创作工作台优化方案 V1.0 §8.3
 * 服务端条件允许时，对 manifest 增加服务端签名。
 *
 * 客户端 JSZip 已打包好 manifest.json 后，将 manifest 内容 + 元信息 POST 到本路由，
 * 服务端用 HMAC-SHA256（密钥来自 env SONG_DELIVERY_SIGNING_KEY）对 manifest 进行签名，
 * 返回 signature + signedAt + signerKeyId。客户端把签名追加到 manifest 后再生成最终 ZIP。
 *
 * 安全边界：
 *   - 必须登录
 *   - 密钥只走 env，不入库不进仓库不打日志
 *   - 签名只针对 manifest 内容，不接触歌词/翻译等作品内容本身
 *   - 密钥未配置时返回 503，客户端降级为"未签名"工作包（不阻塞导出）
 */

import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return Response.json({ success: false, error, code }, { status });
}

function getSigningKey(): string {
  return process.env.SONG_DELIVERY_SIGNING_KEY || "";
}

/**
 * 服务端 HMAC-SHA256 签名。
 * 使用 Web Crypto API（Node.js 18+ 原生支持），不引入额外依赖。
 */
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type SignRequestBody = {
  manifest?: unknown;
  title?: string;
  exportedAt?: string;
  completeness?: string;
  fileCount?: number;
  universeId?: string | null;
};

type SignResponse = {
  success: true;
  signature: string;
  algorithm: string;
  signedAt: string;
  signerKeyId: string;
  signedManifest: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  // --- 1. Auth ---
  let userId: string;
  let userEmail: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    userEmail = user.email;
  } catch {
    return errorResponse(401, "UNAUTHORIZED", "请先登录。");
  }

  // --- 2. 密钥检查 ---
  const signingKey = getSigningKey();
  if (!signingKey) {
    // 密钥未配置：返回 503，客户端应降级为"未签名"工作包
    return errorResponse(503, "SIGNING_NOT_CONFIGURED", "服务端签名未配置，工作包将不包含签名。");
  }

  // --- 3. 读取并校验 manifest ---
  const body = await request.json().catch(() => ({})) as SignRequestBody;
  if (!body || typeof body !== "object" || body.manifest === undefined) {
    return errorResponse(422, "MISSING_MANIFEST", "缺少 manifest 内容。");
  }

  const manifest = body.manifest as Record<string, unknown>;
  if (!manifest || typeof manifest !== "object") {
    return errorResponse(422, "INVALID_MANIFEST", "manifest 必须是对象。");
  }

  // --- 4. 构造待签名的规范化 JSON（与客户端 manifest.json 内容一致 + 服务端元信息） ---
  const signedAt = new Date().toISOString();
  const signerKeyId = `kiikis-song-delivery-${signingKey.slice(0, 4)}`;

  // 把服务端签名元信息追加到 manifest 的 _signature 字段（不影响客户端已生成的其他字段）
  const signedManifest: Record<string, unknown> = {
    ...manifest,
    _signature: {
      algorithm: "HMAC-SHA256",
      signedAt,
      signerKeyId,
      signedBy: userEmail || userId,
      note: "服务端 HMAC 签名，用于验证 manifest 完整性。不构成法律意义上的自动确权。",
    },
  };

  // 规范化 JSON：键名按字典序排序，无空格（保证客户端/服务端签名一致）
  const canonicalJson = canonicalStringify(signedManifest);

  // --- 5. 签名 ---
  let signature: string;
  try {
    signature = await hmacSha256(signingKey, canonicalJson);
  } catch (error) {
    console.error("[song/delivery-package/sign] HMAC failed", error);
    return errorResponse(500, "SIGN_FAILED", "签名失败。");
  }

  const response: SignResponse = {
    success: true,
    signature,
    algorithm: "HMAC-SHA256",
    signedAt,
    signerKeyId,
    signedManifest,
  };

  return Response.json(response, { status: 200 });
}

/**
 * 规范化 JSON 字符串：键名按字典序排序，无多余空格。
 * 客户端生成 manifest.json 时应使用相同规则（或直接 POST 已生成的 manifest，由服务端规范化）。
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(",")}}`;
}
