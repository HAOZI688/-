"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, authEnabled, createSessionToken, verifyPassword } from "@/lib/auth";

/**
 * V4 登录/登出（规格 §28）：单用户最小实现。
 * 契约：form action 返回 void；失败 redirect 回 /login?error=1。
 */

export async function loginAction(formData: FormData) {
  if (!authEnabled()) redirect("/dashboard");
  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) {
    redirect("/login?error=1");
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    // http 本地部署（http://localhost:3210）下部分浏览器/无头实例会丢弃 Secure cookie；
    // https 部署时设置 AUTH_COOKIE_SECURE=1
    secure: process.env.AUTH_COOKIE_SECURE === "1",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect("/");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
