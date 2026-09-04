import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

/** V4 登出：清除会话 cookie → 跳转登录页（app-shell 侧边栏 POST 调用） */
export async function POST(request: Request) {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
