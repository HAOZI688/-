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
    secure: process.env.NODE_ENV === "production",
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
