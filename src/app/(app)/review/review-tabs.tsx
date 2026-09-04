"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  ASSET_TYPE_LABELS,
  PLATFORM_LABELS,
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUS_TONES,
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
import type { WeeklyPlan, WeeklyPlanItem } from "@/lib/db/schema";
import type { ContentAsset, Publication, Topic } from "@/lib/db/schema";

interface Props {
  latestPlan: WeeklyPlan | null;
  pendingItems: WeeklyPlanItem[];
  inReviewAssets: { asset: ContentAsset; topic: Topic }[];
  confirmPubs: { pub: Publication; topic: Topic }[];
}

export function ReviewTabs({ latestPlan, pendingItems, inReviewAssets, confirmPubs }: Props) {
  const [tab, setTab] = React.useState("topics");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="topics">选题确认（{pendingItems.length}）</TabsTrigger>
        <TabsTrigger value="content">内容审核（{inReviewAssets.length}）</TabsTrigger>
        <TabsTrigger value="publishing">发布确认（{confirmPubs.length}）</TabsTrigger>
      </TabsList>

      {/* ===== Tab 1：选题确认（Gate 1） ===== */}
      <TabsContent value="topics">
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
              <p className="p-6 text-center text-xs text-zinc-400">本周选题已全部确认。</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {pendingItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/topics/${item.topicId}`} className="truncate text-[13px] font-medium hover:text-blue-600">
                          {item.topicId}
                        </Link>
                        <StatusBadge label={WORKFLOW_TYPE_LABELS[item.workflowType]} tone="blue" />
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-400">
                        评分 {item.finalScore ?? item.topicScore} · 优先级 {item.priority} · 批次 {latestPlan.weekPrefix}
                      </div>
                    </div>
                    <form action={rejectPlanItemAction.bind(null, item.id)}>
                      <Button variant="outline" size="sm">拒绝</Button>
                    </form>
                  </li>
                ))}
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
      </TabsContent>

      {/* ===== Tab 2：内容审核（Gate 2） ===== */}
      <TabsContent value="content">
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
      </TabsContent>

      {/* ===== Tab 3：发布确认（Gate 3） ===== */}
      <TabsContent value="publishing">
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
                        <Link href={`/topics/${topic.topicId}`} className="truncate text-[13px] font-medium hover:text-blue-600">
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
      </TabsContent>
    </Tabs>
  );
}
