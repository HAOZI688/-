import Link from "next/link";
import { connectorRepository, publicationRepository, socialAccountRepository } from "@/lib/repositories";
import { connectorSyncService, getConnectorAdapter } from "@/lib/services/connector-sync";
import { importAccountsCsvAction, importPostsCsvAction, manualMatchPostAction, retryFailedRowsAction } from "@/app/actions/v3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtNum } from "@/lib/format";
import { PLATFORM_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

/* ===== 数据字典（局部常量；全站数据字典见 lib/labels） ===== */
const MATCH_LABELS: Record<string, string> = {
  confirmed: "已匹配",
  suggested: "建议",
  unmatched: "未匹配",
  conflict: "冲突",
};
const MATCH_TONES: Record<string, "green" | "orange" | "default" | "red"> = {
  confirmed: "green",
  suggested: "orange",
  unmatched: "default",
  conflict: "red",
};
/** V4：匹配方式标签（external_post_id / external_url / platform_time / title_similarity / manual） */
const METHOD_LABELS: Record<string, string> = {
  external_post_id: "作品ID绑定",
  external_url: "URL精确",
  platform_time: "平台+时间",
  title_similarity: "标题相似",
  manual: "人工确认",
};

const FRESHNESS_LABELS: Record<string, string> = {
  fresh: "新鲜",
  aging: "老化",
  stale: "过期",
};
const FRESHNESS_TONES: Record<string, "green" | "orange" | "red"> = {
  fresh: "green",
  aging: "orange",
  stale: "red",
};

const BATCH_TONES: Record<string, "green" | "orange" | "red" | "default"> = {
  completed: "green",
  partial: "orange",
  failed: "red",
  importing: "default",
  uploaded: "default",
};

/** 数据年龄：如 "36h"；无快照（Infinity）显示 — */
const ageLabel = (h: number) => (Number.isFinite(h) ? `${Math.round(h)}h` : "—");

/**
 * 小豆芽数据集成（规格 §34-§43）：
 * 连接器状态（Adapter 模式，禁止伪造 endpoint）/ 账号数据新鲜度 /
 * CSV 导入（检测 → 映射 → 保存模板）/ 未匹配作品手动匹配 / 外部作品与导入批次。
 */
export default async function XiaodouyaPage() {
  // 当前激活适配器（file_import=文件导入模式 / api=API 模式未配置）
  const adapter = await getConnectorAdapter();
  const test = await adapter.testConnection();
  const isApiMode = adapter.mode === "api";

  const [connectors, freshness, unmatched, posts, batches, pubs, accounts] = await Promise.all([
    connectorRepository.listConnectors(),
    connectorSyncService.accountFreshness(),
    connectorRepository.listUnmatchedPosts(),
    connectorRepository.listExternalPosts({ limit: 100 }),
    connectorRepository.listImportBatches(20),
    publicationRepository.list(),
    socialAccountRepository.list(),
  ]);

  const xiaodouya = connectors.find((c) => c.connectorType === "xiaodouya");
  const connectorAccounts = xiaodouya ? await connectorRepository.listConnectorAccounts(xiaodouya.id) : [];
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const byMatch: Record<string, number> = {};
  posts.forEach(({ post }) => {
    byMatch[post.matchStatus] = (byMatch[post.matchStatus] ?? 0) + 1;
  });

  /** 手动匹配：select 值经 FormData 读取后调用 manualMatchPostAction（V3 §37 人工兜底） */
  async function handleManualMatch(formData: FormData) {
    "use server";
    const postId = String(formData.get("postId") ?? "");
    const publicationId = String(formData.get("publicationId") ?? "");
    if (!postId || !publicationId) return;
    await manualMatchPostAction(postId, publicationId);
  }

  /** form action 契约返回 void：包装 importAccountsCsvAction（其返回值为渲染无关的统计） */
  async function submitAccountsCsv(formData: FormData) {
    "use server";
    await importAccountsCsvAction(formData);
  }

  /** form action 契约返回 void：包装 importPostsCsvAction */
  async function submitPostsCsv(formData: FormData) {
    "use server";
    await importPostsCsvAction(formData);
  }

  /** form action 契约返回 void：包装 retryFailedRowsAction（失败行重试） */
  async function handleRetryFailedRows(formData: FormData) {
    "use server";
    const batchId = String(formData.get("batchId") ?? "");
    if (!batchId) return;
    await retryFailedRowsAction(batchId);
  }

  return (
    <div className="space-y-4 p-4">
      {/* 顶部：标题 + 映射模板管理 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">小豆芽数据集成</h1>
          <p className="text-xs text-zinc-500">
            Adapter 原则：不假设公开 API 存在。当前 File Import 模式（规格 §34）：CSV 上传 → 检测 → 映射 → 匹配 → 快照。
          </p>
        </div>
        <Link href="/connectors/xiaodouya/mappings">
          <Button variant="outline">映射模板管理</Button>
        </Link>
      </div>

      {/* 连接器状态卡 */}
      <Card>
        <CardHeader>
          <CardTitle>连接器状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {isApiMode ? (
              <Badge variant="red">API 模式未配置</Badge>
            ) : (
              <Badge variant="green">文件导入模式</Badge>
            )}
            <span className="text-xs text-zinc-500">
              上次同步：{xiaodouya?.lastSyncAt ? fmtDate(xiaodouya.lastSyncAt) : "从未"}
            </span>
          </div>
          <p className="text-xs text-zinc-500">{test.detail}</p>
        </CardContent>
      </Card>

      {/* 账号数据新鲜度 */}
      <Card>
        <CardHeader>
          <CardTitle>账号数据新鲜度（Last Captured At → Fresh/Aging/Stale）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {freshness.length === 0 ? (
            <EmptyState title="暂无账号数据" description="上传账号 CSV 后，这里会展示各账号的数据新鲜度。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号名</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead className="text-right">粉丝数</TableHead>
                  <TableHead className="text-right">新增粉丝</TableHead>
                  <TableHead>最近采集</TableHead>
                  <TableHead className="text-right">数据年龄</TableHead>
                  <TableHead>新鲜度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {freshness.map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell className="font-medium text-zinc-800">{r.accountName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{PLATFORM_LABELS[r.platform] ?? r.platform}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.followers)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.newFollowers)}</TableCell>
                    <TableCell className="tabular-nums text-zinc-500">
                      {r.lastCapturedAt ? fmtDate(r.lastCapturedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ageLabel(r.ageHours)}</TableCell>
                    <TableCell>
                      <Badge variant={FRESHNESS_TONES[r.level]}>{FRESHNESS_LABELS[r.level]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CSV 导入区（两个 form，formData 直传） */}
      <Card>
        <CardHeader>
          <CardTitle>CSV 导入（检测 → 映射 → 导入）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">
            第一次上传 → 检测 Mapping → 保存模板；之后 Auto Detect → Preview → Import（幂等导入，重复文件不重复建数据）。
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {/* 账号 CSV */}
            <form action={submitAccountsCsv} className="space-y-2 rounded-md border border-zinc-200 p-3">
              <div className="text-xs font-semibold text-zinc-700">账号 CSV</div>
              <p className="text-[11px] text-zinc-500">支持列：账号名称 / 平台 / 粉丝数 / 新增粉丝</p>
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="block w-full text-xs text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700"
              />
              <Button size="sm" type="submit">导入账号 CSV</Button>
            </form>

            {/* 作品 CSV */}
            <form action={submitPostsCsv} className="space-y-2 rounded-md border border-zinc-200 p-3">
              <div className="text-xs font-semibold text-zinc-700">作品 CSV</div>
              <p className="text-[11px] text-zinc-500">
                支持列：作品ID / 作品标题 / 发布时间 / 作品链接 / 点赞数 / 评论数 / 分享数 / 播放量
              </p>
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="block w-full text-xs text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <input type="checkbox" name="historicalImport" className="accent-blue-600" />
                历史导入（首次回流历史作品：无发布计划对应不算失败）
              </label>
              <Button size="sm" type="submit">导入作品 CSV</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* 未匹配作品 + 手动匹配 */}
      <Card>
        <CardHeader>
          <CardTitle>
            未匹配作品
            <span className="ml-2 text-[11px] font-normal text-zinc-400">
              未匹配 {byMatch.unmatched ?? 0} · 冲突 {byMatch.conflict ?? 0}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {unmatched.length === 0 ? (
            <EmptyState title="暂无未匹配作品" description="作品导入后未自动匹配到 Publication 的作品会出现在这里，可手动匹配。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>作品标题</TableHead>
                  <TableHead>外部作品ID</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead>手动匹配发布计划</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatched.map(({ post }) => (
                  <TableRow key={post.id}>
                    <TableCell className="max-w-[240px] truncate font-medium text-zinc-800">
                      {post.externalUrl ? (
                        <a href={post.externalUrl} target="_blank" rel="noreferrer" className="hover:text-blue-600">
                          {post.title ?? post.externalPostId}
                        </a>
                      ) : (
                        post.title ?? post.externalPostId
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-500">{post.externalPostId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{PLATFORM_LABELS[post.platform] ?? post.platform}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-500">
                      {post.publishedAt ? fmtDate(post.publishedAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <form action={handleManualMatch} className="flex items-center gap-1.5">
                        <input type="hidden" name="postId" value={post.id} />
                        <select
                          name="publicationId"
                          required
                          className="max-w-[220px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-blue-400 focus:outline-none"
                        >
                          <option value="" disabled>选择发布计划…</option>
                          {pubs.map(({ pub, topic }) => (
                            <option key={pub.id} value={pub.id}>
                              {topic.title}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" type="submit">匹配</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 外部作品 + 导入批次 + 连接器账号映射 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>外部作品（规格 §36-37）</CardTitle></CardHeader>
          <CardContent className="p-0">
            {posts.length === 0 ? (
              <EmptyState title="暂无作品数据" description="请上传作品 CSV，或先配置 API 模式（当前未配置）。" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>作品</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead>发布时间</TableHead>
                    <TableHead>匹配</TableHead>
                    <TableHead>关联发布</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map(({ post, publication }) => (
                    <TableRow key={post.id}>
                      <TableCell className="max-w-[200px] truncate font-medium text-zinc-800">
                        {post.externalUrl ? (
                          <a href={post.externalUrl} target="_blank" rel="noreferrer" className="hover:text-blue-600">
                            {post.title ?? post.externalPostId}
                          </a>
                        ) : (
                          post.title ?? post.externalPostId
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{PLATFORM_LABELS[post.platform] ?? post.platform}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-zinc-500">
                        {post.publishedAt ? fmtDate(post.publishedAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={MATCH_TONES[post.matchStatus] ?? "default"}>
                          {MATCH_LABELS[post.matchStatus] ?? post.matchStatus}
                          {post.matchConfidence ? ` · ${post.matchConfidence}` : ""}
                        </Badge>
                        {post.matchMethod && (
                          <span className="ml-1.5 text-[10px] text-zinc-400">{METHOD_LABELS[post.matchMethod] ?? post.matchMethod}</span>
                        )}
                        {post.historicalImport === 1 && (
                          <span className="ml-1.5 text-[10px] text-amber-500">历史</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        {publication ? (
                          <Link href={`/topics/${publication.topicId}`} className="text-blue-600 hover:underline">
                            已关联
                          </Link>
                        ) : (
                          <span className="text-zinc-400">未关联</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>导入批次（规格 §38）</CardTitle></CardHeader>
            <CardContent className="p-0">
              {batches.length === 0 ? (
                <EmptyState title="暂无导入记录" description="上传 CSV 后，每次导入都会在这里留痕。" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文件</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">总行数</TableHead>
                      <TableHead className="text-right">成功</TableHead>
                      <TableHead className="text-right">失败</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => {
                      const hasFailedRows = Array.isArray(b.failedRowData) && b.failedRowData.length > 0;
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="max-w-[160px] truncate font-medium text-zinc-700">{b.fileName}</TableCell>
                          <TableCell>
                            <Badge variant={BATCH_TONES[b.status] ?? "default"}>{b.status}</Badge>
                            {b.historicalImport === 1 && (
                              <span className="ml-1 text-[10px] text-amber-500">历史</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{b.totalRows ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">{b.successRows ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-500">{b.failedRows ?? "—"}</TableCell>
                          <TableCell className="tabular-nums text-zinc-500">{fmtDate(b.createdAt)}</TableCell>
                          <TableCell>
                            {hasFailedRows && (
                              <div className="flex items-center gap-1.5">
                                <form action={handleRetryFailedRows}>
                                  <input type="hidden" name="batchId" value={b.id} />
                                  <Button size="sm" variant="outline" type="submit">重试失败行</Button>
                                </form>
                                <a href={`/api/connectors/export-failed-rows?batchId=${b.id}`} target="_blank" rel="noreferrer">
                                  <Button size="sm" variant="ghost">导出失败行</Button>
                                </a>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>连接器账号映射（规格 §35）</CardTitle></CardHeader>
            <CardContent className="p-0">
              {connectorAccounts.length === 0 ? (
                <EmptyState title="暂无账号映射" description="上传账号 CSV 后，外部账号与本平台账号的映射关系会展示在这里。" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>外部账号</TableHead>
                      <TableHead>外部账号ID</TableHead>
                      <TableHead>映射状态</TableHead>
                      <TableHead>关联平台账号</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connectorAccounts.map(({ ca }) => {
                      const acc = accountMap.get(ca.socialAccountId);
                      return (
                        <TableRow key={ca.id}>
                          <TableCell className="max-w-[160px] truncate font-medium text-zinc-800">
                            {ca.externalAccountName ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-zinc-500">{ca.externalAccountId ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={ca.mappingStatus === "mapped" ? "green" : "default"}>
                              {ca.mappingStatus === "mapped" ? "已映射" : "未映射"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate text-zinc-600">
                            {acc ? `${acc.accountName}（${PLATFORM_LABELS[acc.platform] ?? acc.platform}）` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
