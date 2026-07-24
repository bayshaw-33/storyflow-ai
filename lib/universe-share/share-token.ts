/**
 * 宇宙分享访问令牌（阶段 B）
 *
 * 使用 Web Crypto API 手写 HS256 JWT（避免引入 jose/jsonwebtoken 依赖）。
 * 24h 有效期，使用 SHARE_JWT_SECRET 签名。
 *
 * 设计文档 §3.2 / §5：
 * - JWT payload 含 universe_id、share_updated_at、viewer_session
 * - 修改密码后 share_updated_at 变化，旧 JWT 自动失效
 *
 * 注意：本模块仅在服务端 Node.js runtime 使用（依赖 crypto.subtle 与 Buffer）。
 */

export type ShareTokenPayload = {
  universe_id: string;
  share_updated_at: string;
  viewer_session: true;
  iat: number;
  exp: number;
};

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h

function getSecret(): string {
  const secret = process.env.SHARE_JWT_SECRET;
  if (!secret) {
    throw new Error("SHARE_JWT_SECRET_NOT_CONFIGURED");
  }
  return secret;
}

function base64UrlEncode(input: Uint8Array | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(message: string, secret: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/**
 * 签发分享访问 JWT。
 *
 * @param payload 业务字段（universe_id / share_updated_at / viewer_session）
 * @returns JWT 字符串
 */
export async function signShareToken(payload: {
  universe_id: string;
  share_updated_at: string;
  viewer_session: true;
}): Promise<string> {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: ShareTokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = await sign(signingInput, secret);
  const sigB64 = base64UrlEncode(signature);
  return `${signingInput}.${sigB64}`;
}

/**
 * 验证分享访问 JWT。
 *
 * @param token JWT 字符串
 * @returns `{ valid, payload?, expired? }`
 *  - valid=true：签名正确且未过期
 *  - expired=true：签名正确但已过期（payload 仍返回，供调试）
 *  - valid=false 且 expired=false：签名错误或格式非法
 */
export async function verifyShareToken(token: string): Promise<{
  valid: boolean;
  payload?: ShareTokenPayload;
  expired?: boolean;
}> {
  if (!token || typeof token !== "string") {
    return { valid: false };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false };

  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { valid: false };
  }

  let expectedSig: Uint8Array;
  try {
    expectedSig = await sign(signingInput, secret);
  } catch {
    return { valid: false };
  }

  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(sigB64);
  } catch {
    return { valid: false };
  }

  if (providedSig.length !== expectedSig.length) return { valid: false };
  // 常量时间比对
  const a = Buffer.from(expectedSig);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ providedSig[i];
  }
  if (diff !== 0) return { valid: false };

  let payload: ShareTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as ShareTokenPayload;
  } catch {
    return { valid: false };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || now >= payload.exp) {
    return { valid: false, payload, expired: true };
  }

  return { valid: true, payload, expired: false };
}
