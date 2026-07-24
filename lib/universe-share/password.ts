/**
 * 宇宙分享密码哈希与校验（阶段 B）
 *
 * 使用 Node.js 内置 crypto.scrypt（避免引入 bcryptjs 依赖）。
 * 哈希格式：`scrypt$<saltHex>$<hashHex>`
 *
 * 设计文档 §2.1 / §3.1：密码 6-32 字符。
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_KEYLEN,
      SCRYPT_PARAMS,
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived);
      },
    );
  });
}

/**
 * 哈希明文密码。返回 `scrypt$<saltHex>$<hashHex>` 格式字符串。
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const derived = await scryptAsync(plain, salt);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * 比对明文密码与已存储的哈希。
 * 支持的哈希格式：`scrypt$<saltHex>$<hashHex>`。
 * 任何格式错误或比对失败都返回 false（不抛错，避免泄露内部状态）。
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || typeof hash !== "string") return false;
  const parts = hash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scryptAsync(plain, salt);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * 校验密码输入长度（6-32 字符）。
 */
export function validatePasswordInput(plain: string): { valid: boolean; error?: string } {
  if (typeof plain !== "string" || plain.length < 6) {
    return { valid: false, error: "密码至少 6 个字符。" };
  }
  if (plain.length > 32) {
    return { valid: false, error: "密码最多 32 个字符。" };
  }
  return { valid: true };
}

/**
 * 生成随机字母数字密码（默认 8 位）。
 */
export function generateRandomPassword(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
