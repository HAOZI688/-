import Link from "next/link";
import { orchestratorRepository, contentRepository, publicationRepository } from "@/lib/repositories";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { PriorityBadge } from "@/components/ui/badge";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  ASSET_TYPE_LABELS,
  PLATFORM_LABELS,
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUS_TONES,
  TOPIC_STATUS_LABELS,
  TOPIC_STATUS_TONES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/labels";
import {
  confirmPlanAction,
  rejectPlanItemAction,
  approveAssetAction,
  revisionAssetAction,
  startProductionAction,
  confirmPublicationAction,
} from "@/app/actions/review";

export const dynamic = "force-dynamic";

/**
 * Human Gate 工作台（V2 P0）：三扇门禁的待审核聚合。
 * Gate 1 选题确认（Orchestrator 计划项）→ Gate 2 内容审核（in_review 资产）→ Gate 3 发布确认。
 * 每一栏的确认动作都真实落库 + 审计；系统绝不自动发布。
 */
export default async function ReviewPage() {
  const [plans, assets, pubs] = await Promise.all([
    orchestratorRepository.listPlans(3),
    contentRepository.listAllAssets(200),
    publicationRepository.list(),
  ]);

  const latestPlan = plans[0] ?? null;
  const planItems = latestPlan ? await orchestratorRepository.getPlanItems(latestPlan.id) : [];
  const pendingItems = planItems.filter((i) => i.status === "pending");
  const inReviewAssets = assets.filter((a) => a.asset.status === "in_review");
  const confirmPubs = pubs.filter((p) => p.pub.status === "planned" || p.pub.status === "ready");

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">人工门禁 · 待审核</h1>
        <p className="text-xs text-zinc-500">
          三道门禁：选题确认 → 内容审核 → 发布确认。系统任何环节都不自动发布。
          {latestPlan && ` 当前计划 ${latestPlan.weekPrefix}（${latestPlan.status}）`}
        </p>
      </div>

      {/* Gate 1：选题确认 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              Gate 1 · 选题确认
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-normal text-orange-700">{pendingItems.length} 待确认</span>
            </div>
            {latestPlan && latestPlan.status === "confirmed" && (
              <form action={startProductionAction.bind(null, latestPlan.id)}>
                <Button size="sm">开始生产（触发 DAG）</Button>
              </form>
            )}
          </div>
          {!latestPlan ? (
            <p className="p-6 text-center text-xs text-zinc-400">本周还没有计划，请先在仪表盘「生成本周内容计划」。</p>
          ) : pendingItems.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">本周选题已全部确认（{planItems.length} 项）。</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {pendingItems.map((item) => {
                const topic = planItems.find((t) => t.id === item.id);
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/topics/${item.topicId}`} className="truncate text-[13px] font-medium hover:text-blue-600">
                          {item.topicId}
                        </Link>
                        <StatusBadge label={WORKFLOW_TYPE_LABELS[item.workflowType]} tone="blue" />
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-400">
                        评分 {item.topicScore} · 优先级 {item.priority} · 批次 {latestPlan.weekPrefix}
                      </div>
                    </div>
                    <form action={rejectPlanItemAction.bind(null, item.id)}>
                      <Button variant="outline" size="sm">拒绝</Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
          {latestPlan && latestPlan.status === "draft" && (
            <div className="border-t border-zinc-100 px-3 py-2">
              <form action={confirmPlanAction.bind(null, latestPlan.id)}>
                <Button size="sm">确认本周选题（{pendingItems.length} 项）</Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gate 2：内容审核 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-semibold">
            Gate 2 · 内容审核
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-normal text-orange-700">{inReviewAssets.length} 待审核</span>
          </div>
          {inReviewAssets.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">没有待审核的内容资产（工作流产出的 in_review 内容会出现在这里）。</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {inReviewAssets.map(({ asset, topic }) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/content/${topic.id}`} className="truncate text-[13px] font-medium hover:text-blue-600">
                        {asset.title}
                      </Link>
                      <StatusBadge label={ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType} tone="default" />
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-400">
                      {topic.title} · {PLATFORM_LABELS[asset.platform ?? ""] ?? asset.platform ?? "—"} · v{asset.version}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <form action={revisionAssetAction.bind(null, asset.id)}>
                      <Button variant="outline" size="sm">打回</Button>
                    </form>
                    <form action={approveAssetAction.bind(null, asset.id)}>
                      <Button size="sm">通过</Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Gate 3：发布确认 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-semibold">
            Gate 3 · 发布确认
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-normal text-orange-700">{confirmPubs.length} 待确认</span>
          </div>
          {confirmPubs.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">没有待确认的发布计划。</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {confirmPubs.map(({ pub, topic }) => (
                <li key={pub.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/topics/${topic.id}`} className="truncate text-[13px] font-medium hover:text-blue-600">
                        {topic.title}
                      </Link>
                      <StatusBadge label={PLATFORM_LABELS[pub.platform] ?? pub.platform} tone="default" />
                      <StatusBadge label={PUBLICATION_STATUS_LABELS[pub.status] ?? pub.status} tone={PUBLICATION_STATUS_TONES[pub.status]} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-400">
                      计划发布 {pub.scheduledDate ?? "未排期"} · {pub.publishedUrl ? "已登记链接" : "未发布"}
                    </div>
                  </div>
                  <form action={confirmPublicationAction.bind(null, pub.id)}>
                    <Button size="sm">{pub.status === "planned" ? "确认就绪" : "确认排期"}</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
