import Link from "next/link";
import { publishPackageRepository } from "@/lib/repositories";
import { githubRepository } from "@/lib/repositories";
import { createGithubWeeklyPackageAction } from "@/app/actions/publish-package";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PKG_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  needs_assets: "缺视觉资产",
  needs_review: "待 QA 审核",
  ready: "可发布",
  published: "已发布",
};
const PKG_STATUS_TONES: Record<string, "orange" | "blue" | "green" | "default"> = {
  draft: "default",
  needs_assets: "orange",
  needs_review: "blue",
  ready: "green",
  published: "green",
};

/**
 * Publish Packages（V4 规格 §13-§17）：发布包列表 + GitHub 周榜包一键生成。
 */
export default async function PublishPackagesPage() {
  const [packages, snapshots] = await Promise.all([
    publishPackageRepository.list(50),
    githubRepository.listSnapshots(),
  ]);
  const latestSnapshot = snapshots[0] ?? null;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">发布包（Publish Package）</h1>
        <p className="text-xs text-zinc-500">
          一次可发布内容的完整打包：正文 + 封面/配图 + CTA + 发布说明 · QA 三项通过才可发布（规格 §13-§17）
        </p>
      </div>

      {/* GitHub 周榜包生成 */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div>
            <div className="text-xs font-semibold">GitHub 周榜发布包（确定性组装，数字全部来自快照）</div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              1 封面 + 5 项目卡片 + 总榜文案 + 5 项目文案 + 极简提纲 + 平台标题 + 标签 + 图片顺序 + Snapshot 绑定
              {latestSnapshot ? ` · 最新快照：${latestSnapshot.snapshotId}（${latestSnapshot.week}）` : " · 暂无快照"}
            </p>
          </div>
          {latestSnapshot ? (
            <form action={createGithubWeeklyPackageAction.bind(null, latestSnapshot.id)}>
              <Button size="sm">生成本周发布包</Button>
            </form>
          ) : (
            <Button size="sm" disabled>暂无快照</Button>
          )}
        </CardContent>
      </Card>

      {/* 包列表 */}
      <Card>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <EmptyState title="还没有发布包" description="选择一个 GitHub 快照生成第一份发布包。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>QA（事实/品牌/内容）</TableHead>
                  <TableHead>视觉</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[280px] truncate font-medium text-zinc-800">{p.title ?? "（无标题）"}</TableCell>
                    <TableCell>
                      <StatusBadge label={p.packageType === "github_weekly" ? "GitHub 周榜" : p.packageType} tone="blue" />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={PKG_STATUS_LABELS[p.status] ?? p.status} tone={PKG_STATUS_TONES[p.status] ?? "default"} />
                    </TableCell>
                    <TableCell className="text-[11px] text-zinc-500">
                      {p.factQaStatus} / {p.brandQaStatus} / {p.contentQaStatus}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{((p.visualAssetIds as string[]) ?? []).length}</TableCell>
                    <TableCell className="tabular text-[11px] text-zinc-500">{fmtDate(p.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/publish-packages/${p.id}`} className="text-[11px] text-blue-600 hover:underline">详情 →</Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
