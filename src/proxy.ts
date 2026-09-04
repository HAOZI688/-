/**
 * V4 路由保护（Next.js 16 Proxy，原 Middleware；规格 §28）。
 * - 未配置 AUTH 凭证时放行（开发模式）
 * - 公开路径：/login、/api/auth/*、/api/cron/*（由路由内 CRON_SECRET 校验）、静态资源
 * - 页面未登录 → 302 /login；API 未登录 → 401 JSON
 * - 会话校验：HMAC-SHA256 签名 + 过期（与 lib/auth.ts 同构，独立实现避免引入 next/headers）
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "contentos_session";

function credentialHash(): string {
  if (process.env.AUTH_PASSWORD_HASH) return process.env.AUTH_PASSWORD_HASH;
  return createHmac("sha256", "contentos").update(process.env.AUTH_PASSWORD ?? "").digest("hex");
}

function sessionSecret(): string {
  return process.env.AUTH_SECRET ?? `contentos-session:${credentialHash()}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiryStr, sig] = token.split(".");
  if (!expiryStr || !sig) return false;
  const expected = createHmac("sha256", sessionSecret()).update(expiryStr).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return false;
  } catch {
    return false;
  }
  return Number(expiryStr) > Date.now();
}

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron", "/uploads", "/favicon.ico", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 开发模式未配置凭证 → 全部放行
  const enabled = Boolean(process.env.AUTH_PASSWORD_HASH || process.env.AUTH_PASSWORD);
  if (!enabled) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
