/**
 * V4 最小 Auth（规格 §28）：单用户 / 单工作区。
 * - 凭证全部来自环境变量：AUTH_PASSWORD_HASH（sha256 hex，推荐）或 AUTH_PASSWORD（明文，仅开发）
 * - 会话：HMAC-SHA256 签名 cookie（contentos_session），7 天有效，httpOnly
 * - 未配置凭证时 authEnabled()=false（开发模式放行；readiness 页会标记）
 * - 代理层（src/proxy.ts）保护除 /login、/api/auth、/api/cron 外的全部路由
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "contentos_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

export function authEnabled(): boolean {
  return Boolean(process.env.AUTH_PASSWORD_HASH || process.env.AUTH_PASSWORD);
}

function credentialHash(): string {
  if (process.env.AUTH_PASSWORD_HASH) return process.env.AUTH_PASSWORD_HASH;
  return createHash("sha256").update(process.env.AUTH_PASSWORD ?? "").digest("hex");
}

/** 校验密码（常量时间比较） */
export function verifyPassword(password: string): boolean {
  if (!authEnabled()) return false;
  const given = createHash("sha256").update(password).digest("hex");
  const expected = credentialHash();
  try {
    return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** 会话签名密钥：优先 AUTH_SECRET；未配置时从凭证派生（同凭证单实例部署安全） */
function sessionSecret(): string {
  return process.env.AUTH_SECRET ?? `contentos-session:${credentialHash()}`;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

/** 生成会话 token：`${expiryMs}.${hmac(expiryMs)}` */
export function createSessionToken(): string {
  const expiry = Date.now() + SESSION_TTL_MS;
  return `${expiry}.${sign(String(expiry))}`;
}

/** 校验会话 token（签名 + 过期） */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expiryStr, sig] = token.split(".");
  if (!expiryStr || !sig) return false;
  const expectedSig = sign(expiryStr);
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return false;
  } catch {
    return false;
  }
  return Number(expiryStr) > Date.now();
}

/** 当前是否已登录（server 端读取 cookie） */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export const SESSION_MAX_AGE_S = Math.floor(SESSION_TTL_MS / 1000);
