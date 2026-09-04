import Link from "next/link";
import { connectorRepository } from "@/lib/repositories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

/**
 * 小豆芽连接器（规格 §72）：连接器状态 + 外部作品 + 匹配 + 快照。
 */
export default async function XiaodouyaPage() {
  const [connectors, posts, batches] = await Promise.all([
    connectorRepository.listConnectors(),
    connectorRepository.listExternalPosts({ limit: 100 }),
    connectorRepository.listImportBatches(20),
  ]);

  const xiaodouya = connectors.find((c) => c.connectorType === "xiaodouya");

  const matchTone: Record<string, "green" | "orange" | "red" | "default"> = {
    confirmed: "green",
    suggested: "orange",
    unmatched: "default",
    conflict: "red",
  };

  const byMatch: Record<string, number> = {};
  posts.forEach(({ post }) => { byMatch[post.matchStatus] = (byMatch[post.matchStatus] ?? 0) + 1; });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">小豆芽数据集成</h1>
        <p className="text-xs text-zinc-500">
          V1 File Import 模式（规格 §34）：CSV 上传 → 检测 → 映射 → 匹配 → T+1/3/7/30 快照。
          API Mode 为预留（connector_type=future_api）。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-zinc-400">连接器</div>
            <div className="mt-1 flex items-center gap-2">
              {xiaodouya ? <Badge variant="green">active</Badge> : <Badge variant="default">未初始化</Badge>}
              <span className="text-xs text-zinc-600">{xiaodouya?.name ?? "—"}</span>
            </div>
            <div className="mt-1 text-[10px] text-zinc-400">上次同步：{xiaodouya?.lastSyncAt ? xiaodouya.lastSyncAt.toLocaleString("zh-CN") : "从未"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-zinc-400">外部作品</div>
            <div className="text-lg font-semibold tabular">{posts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-zinc-400">已匹配</div>
            <div className="text-lg font-semibold tabular text-emerald-600">{byMatch.confirmed ?? 0} <span className="text-xs text-zinc-400">+{byMatch.suggested ?? 0} 建议</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-zinc-400">导入批次</div>
            <div className="text-lg font-semibold tabular">{batches.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>外部作品与匹配（规格 §36-37）</CardTitle></CardHeader>
          <CardContent className="p-0">
            {posts.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-400">
                暂无作品数据。请到「数据导入」上传小豆芽 CSV。
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-2">作品</th>
                    <th className="px-2 py-2">平台</th>
                    <th className="px-2 py-2">发布时间</th>
                    <th className="px-2 py-2">匹配</th>
                    <th className="px-4 py-2">关联发布</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map(({ post, publication }) => (
                    <tr key={post.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="max-w-[200px] truncate px-4 py-2 font-medium text-zinc-800">
                        {post.externalUrl ? (
                          <a href={post.externalUrl} target="_blank" rel="noreferrer" className="hover:text-blue-600">{post.title ?? post.externalPostId}</a>
                        ) : (post.title ?? post.externalPostId)}
                      </td>
                      <td className="px-2 py-2"><Badge variant="outline">{PLATFORM_LABELS[post.platform] ?? post.platform}</Badge></td>
                      <td className="px-2 py-2 tabular text-zinc-500">{post.publishedAt ? post.publishedAt.toLocaleDateString("zh-CN") : "—"}</td>
                      <td className="px-2 py-2">
                        <Badge variant={matchTone[post.matchStatus] ?? "default"}>{post.matchStatus}{post.matchConfidence ? ` · ${post.matchConfidence}` : ""}</Badge>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2">
                        {publication ? (
                          <Link href={`/topics/${publication.topicId}`} className="text-blue-600 hover:underline">已关联</Link>
                        ) : <span className="text-zinc-400">未关联</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>导入批次（规格 §38）</CardTitle></CardHeader>
          <CardContent className="p-0">
            {batches.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-400">暂无导入记录。</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-2">文件</th>
                    <th className="px-2 py-2">状态</th>
                    <th className="px-2 py-2">总行数</th>
                    <th className="px-2 py-2">成功</th>
                    <th className="px-2 py-2">失败</th>
                    <th className="px-4 py-2">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b border-zinc-50">
                      <td className="max-w-[180px] truncate px-4 py-2 font-medium text-zinc-700">{b.fileName}</td>
                      <td className="px-2 py-2">
                        <Badge variant={b.status === "completed" ? "green" : b.status === "failed" ? "red" : b.status === "partial" ? "orange" : "default"}>{b.status}</Badge>
                      </td>
                      <td className="px-2 py-2 tabular">{b.totalRows ?? "—"}</td>
                      <td className="px-2 py-2 tabular text-emerald-600">{b.successRows ?? "—"}</td>
                      <td className="px-2 py-2 tabular text-red-500">{b.failedRows ?? "—"}</td>
                      <td className="px-4 py-2 tabular text-zinc-500">{b.createdAt.toLocaleString("zh-CN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
