import { orchestratorRepository, contentRepository, publicationRepository } from "@/lib/repositories";
import { ReviewTabs } from "./review-tabs";

export const dynamic = "force-dynamic";

/**
 * Human Gate 审核页（V3）：Tabs 三栏（Topics / Content / Publishing）。
 * 数据全部在 server 层一次性拉取，客户端只做 Tab 切换（无重复查询、无 N+1）。
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

  // B-4 §17：Gate 2 审核详情——完整正文 / 业务 Gate 结果 / 版本数 / Topic
  const reviewDetails = await Promise.all(
    inReviewAssets.slice(0, 20).map(async ({ asset, topic }) => {
      const [versions, runs] = await Promise.all([
        contentRepository.listVersions(asset.id),
        (async () => {
          const { workflowRepository } = await import("@/lib/repositories");
          const all = await workflowRepository.getRunsByTopic(asset.topicId);
          return all.filter((r) => r.output && typeof r.output === "object" && (r.output as { businessGate?: unknown }).businessGate).slice(0, 1);
        })(),
      ]);
      const gateReasons = runs[0]
        ? ((runs[0].output as { businessGate?: string[] }).businessGate ?? [])
        : [];
      return {
        asset,
        topic,
        contentLength: (asset.content ?? "").length,
        versionCount: versions.length,
        humanEdited: versions.some((v) => v.createdBy === "user"),
        businessGateReasons: gateReasons,
      };
    }),
  );

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">人工门禁 · 待审核</h1>
        <p className="text-xs text-zinc-500">
          三道门禁：选题确认 → 内容审核 → 发布确认。系统任何环节都不自动发布。
          {latestPlan && ` 当前计划 ${latestPlan.weekPrefix}（${latestPlan.status}）`}
        </p>
      </div>
      <ReviewTabs
        latestPlan={latestPlan}
        pendingItems={pendingItems}
        inReviewAssets={inReviewAssets}
        confirmPubs={confirmPubs}
        reviewDetails={reviewDetails}
      />
    </div>
  );
}
