import { loginAction } from "@/app/actions/auth";
import { authEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** V4 登录页（规格 §28）：单用户密码登录。 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const enabled = authEnabled();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">Content OS 登录</h1>
          <p className="mt-1 text-xs text-zinc-500">单用户工作区 · 会话 7 天有效</p>
        </div>

        {!enabled ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            未配置登录凭证（AUTH_PASSWORD_HASH / AUTH_PASSWORD）。当前为开发模式，无需登录 ——
            配置凭证后此页生效。参见 .env.example。
          </div>
        ) : (
          <form action={loginAction} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-600">密码</span>
              <input
                type="password"
                name="password"
                required
                autoFocus
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                placeholder="输入工作区密码"
              />
            </label>
            {error && <p className="text-xs text-red-600">密码错误，请重试。</p>}
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              登录
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
