import { socialAccountRepository } from "@/lib/repositories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

/**
 * 社交账号（规格 §32/§71）：平台账号主档。
 * 小豆芽数据以账号为粒度回流；Publication 绑定账号。
 */
export default async function AccountsPage() {
  const accounts = await socialAccountRepository.list();

  const byPlatform: Record<string, number> = {};
  accounts.forEach((a) => { byPlatform[a.platform] = (byPlatform[a.platform] ?? 0) + 1; });

  const statusTone: Record<string, "green" | "default" | "red"> = {
    active: "green",
    inactive: "default",
    revoked: "red",
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">社交账号</h1>
        <p className="text-xs text-zinc-500">
          平台账号主档：发布计划绑定账号；小豆芽数据回流以账号为粒度（规格 §41）。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(byPlatform).map(([platform, count]) => (
          <Card key={platform}>
            <CardContent className="flex items-center justify-between p-3">
              <Badge variant="outline">{PLATFORM_LABELS[platform] ?? platform}</Badge>
              <span className="text-lg font-semibold tabular">{count}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账号列表</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">暂无账号。</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2">账号</th>
                  <th className="px-2 py-2">平台</th>
                  <th className="px-2 py-2">外部 ID</th>
                  <th className="px-2 py-2">状态</th>
                  <th className="px-4 py-2">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="flex items-center gap-2 px-4 py-2">
                      {a.avatarUrl && <img src={a.avatarUrl} alt="" className="h-6 w-6 rounded-full" />}
                      <span className="font-medium text-zinc-800">{a.accountName}</span>
                    </td>
                    <td className="px-2 py-2"><Badge variant="outline">{PLATFORM_LABELS[a.platform] ?? a.platform}</Badge></td>
                    <td className="px-2 py-2 text-zinc-500">{a.externalAccountId ?? "—"}</td>
                    <td className="px-2 py-2"><Badge variant={statusTone[a.status] ?? "default"}>{a.status}</Badge></td>
                    <td className="px-4 py-2 tabular text-zinc-500">{a.createdAt.toLocaleDateString("zh-CN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
