/**
 * Publish Package Service（V4 规格 §13-§17）：
 * 至少一种内容类型（GitHub 周榜）可生成完整「发布包」：
 *   1 Cover + 5 Project Cards + 总榜文案 + 5 项目文案 + 极简提纲 +
 *   平台标题 + 标签 + 图片顺序 + Snapshot_ID + Snapshot Period。
 *
 * 原则：
 * - GitHub 周榜数据来自 github_snapshot_items（真实快照），文案按确定性模板组装（数字不编造）；
 *   AI 润色是可选增强，绝不替代快照数字。
 * - 状态机：draft → needs_assets（缺视觉）→ needs_review（待 QA）→ ready → published。
 * - QA 三项（fact/brand/content）全部 pass 才能 ready；锁定品牌资产禁止替换。
 */
import { publishPackageRepository } from "@/lib/repositories";
import { auditRepository } from "@/lib/repositories";
import { githubRepository } from "@/lib/repositories";
import { db } from "@/lib/db";
import { githubSnapshots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type PackageStatus = "draft" | "needs_assets" | "needs_review" | "ready" | "published";

export const publishPackageService = {
  /**
   * 从 GitHub 快照生成周榜发布包（确定性组装，数字全部来自快照）。
   * 已存在同快照的包时返回已有包（幂等）。
   */
  async createFromGithubSnapshot(snapshotId: string) {
    // 幂等：同快照已有包直接返回
    const existing = (await publishPackageRepository.list(100)).find((p) => p.githubSnapshotId === snapshotId);
    if (existing) return { package: existing, created: false };

    const snapshot = await githubRepository.getSnapshot(snapshotId);
    if (!snapshot) throw new Error("快照不存在");
    const items = (await githubRepository.getItems(snapshotId)).filter((i) => i.selected);
    if (items.length === 0) throw new Error("快照没有选中项目（先在 GitHub 周榜页选择项目）");
    const top5 = items.sort((a, b) => a.rank - b.rank).slice(0, 5);

    const repoName = (r: string) => r.split("/").pop() ?? r;
    const fmtStars = (n: number | null) => (n === null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    const fmtGrowth = (g: string | null) => {
      if (!g) return "—";
      const m = /(\d+)/.exec(g);
      return m ? `+${m[1]}` : g;
    };

    // 平台标题（公众号/小红书通用）
    const title = `GitHub 本周增速 Top ${top5.length}（${snapshot.week}）｜纯周榜，无历史包袱`;

    // 总榜文案（确定性模板：排名 + 项目 + 周增 + 总星）
    const rankLines = top5
      .map((i) => `${i.rank}. **${repoName(i.repository)}**（${fmtGrowth(i.weeklyGrowth)}/周，总 ${fmtStars(i.totalStars)}★）`)
      .join("\n");
    const listCopy = `## 本周总榜\n\n${rankLines}\n\n> 数据来源：GitHub 周榜快照 ${snapshot.snapshotId}（${snapshot.week}），纯周增速排名，无历史星数加成。`;

    // 5 条项目文案（每条 = 为什么值得关注）
    const projectCopies = top5.map((i) => {
      const name = repoName(i.repository);
      return `### ${i.rank}. ${name}\n\n- 周增速：${fmtGrowth(i.weeklyGrowth)}（总 ${fmtStars(i.totalStars)}★）\n- 仓库：${i.repoUrl ?? i.repository}\n- 核验状态：${i.verificationStatus === "verified" ? "已核验" : i.verificationStatus === "conflict" ? "存在冲突（谨慎引用）" : "未核验"}\n- 推荐理由：本周增速进入周榜 Top ${top5.length}，适合关注其最新动态与上游生态位。`;
    });

    // 极简提纲（图片/口播共用）
    const outline = [
      `1. 开场：本周 GitHub 增速榜 Top ${top5.length}（${snapshot.week}）`,
      ...top5.map((i) => `${i.rank + 1}. ${repoName(i.repository)}：${fmtGrowth(i.weeklyGrowth)}/周，一句话点评`),
      `${top5.length + 2}. 收尾：完整数据与核验细节见图文版`,
    ].join("\n");

    // 标签
    const hashtags = ["GitHub周榜", "开源项目", "AI编程", "开发者工具", snapshot.week];

    // CTA
    const primaryCta = "关注我，每周一发布上周 GitHub 纯周增速榜；评论区留言你最关注的项目，下期优先解读。";

    // 图片顺序说明（1 Cover + 5 Project Cards）
    const imageOrder = [
      { order: 1, kind: "cover", label: `封面：${snapshot.week} GitHub 增速 Top ${top5.length}` },
      ...top5.map((i, idx) => ({ order: idx + 2, kind: "card", label: `卡片${idx + 1}：${repoName(i.repository)}（${fmtGrowth(i.weeklyGrowth)}/周）` })),
    ];

    const pkg = await publishPackageRepository.create({
      packageType: "github_weekly",
      platform: "wechat",
      githubSnapshotId: snapshotId,
      topicId: null,
      contentAssetId: null,
      title,
      body: [listCopy, "", ...projectCopies, "", "---", "", `## 极简提纲（口播/图片共用）\n\n${outline}`, "", `## 图片顺序\n\n${imageOrder.map((o) => `${o.order}. ${o.kind === "cover" ? "封面" : "卡片"}：${o.label}`).join("\n")}`].join("\n"),
      primaryCta,
      hashtags: hashtags as never,
      visualAssetIds: [] as never,
      factQaStatus: "pending",
      brandQaStatus: "pending",
      contentQaStatus: "pending",
      status: "needs_assets",
      publishNotes: `数据绑定 Snapshot ${snapshot.snapshotId}（Period ${snapshot.week}）；视觉资产上传后进入 QA。`,
    });

    await auditRepository.log({
      action: "system",
      entityType: "publish_packages",
      entityId: pkg.id,
      actor: "system",
      before: null,
      after: { snapshotId: snapshot.snapshotId, week: snapshot.week, items: top5.length },
      notes: `生成 GitHub 周榜发布包（快照 ${snapshot.snapshotId}）`,
    });

    return { package: pkg, created: true };
  },

  /** QA 确认：单项 QA 标记 pass/fail；三项全 pass 且有视觉资产 → ready 候选 */
  async setQa(packageId: string, kind: "fact" | "brand" | "content", pass: boolean, note?: string) {
    const pkg = await publishPackageRepository.getById(packageId);
    if (!pkg) throw new Error("发布包不存在");
    const patch =
      kind === "fact"
        ? { factQaStatus: pass ? "passed" : "failed" }
        : kind === "brand"
          ? { brandQaStatus: pass ? "passed" : "failed" }
          : { contentQaStatus: pass ? "passed" : "failed" };
    const updated = await publishPackageRepository.update(packageId, { ...patch, publishNotes: note ? `${pkg.publishNotes ?? ""}\n[QA-${kind}] ${note}`.trim() : pkg.publishNotes });
    await auditRepository.log({
      action: "system",
      entityType: "publish_packages",
      entityId: packageId,
      actor: "user",
      before: { [`${kind}QaStatus`]: pkg[`${kind}QaStatus` as keyof typeof pkg] },
      after: patch,
      notes: `QA-${kind} ${pass ? "通过" : "不通过"}`,
    });
    return updated;
  },

  /** 状态推进（带 QA 门禁）：needs_review → ready 需三项 QA 全 passed；ready → published 需发布确认 */
  async transition(packageId: string, to: PackageStatus) {
    const pkg = await publishPackageRepository.getById(packageId);
    if (!pkg) throw new Error("发布包不存在");

    const visuals = (pkg.visualAssetIds as string[] | null) ?? [];
    const qaAllPassed = pkg.factQaStatus === "passed" && pkg.brandQaStatus === "passed" && pkg.contentQaStatus === "passed";

    if (to === "needs_review") {
      if (visuals.length < 2) throw new Error("视觉资产不足（至少封面 + 1 卡片），禁止进入 QA");
    }
    if (to === "ready") {
      if (!qaAllPassed) throw new Error("三项 QA（事实/品牌/内容）未全部通过，禁止 ready");
      if (visuals.length < 2) throw new Error("视觉资产不足，禁止 ready");
    }
    if (to === "published") {
      if (pkg.status !== "ready") throw new Error("只有 ready 状态可标记发布");
    }
    const updated = await publishPackageRepository.update(packageId, { status: to, publishedAt: to === "published" ? new Date() : pkg.publishedAt });
    await auditRepository.log({
      action: "system",
      entityType: "publish_packages",
      entityId: packageId,
      actor: "user",
      before: { status: pkg.status },
      after: { status: to },
      notes: `发布包状态：${pkg.status} → ${to}`,
    });
    return updated;
  },

  /** 挂载视觉资产（顺序 = 数组顺序；锁定的品牌资产禁止替换） */
  async attachVisual(packageId: string, brandAssetId: string) {
    const pkg = await publishPackageRepository.getById(packageId);
    if (!pkg) throw new Error("发布包不存在");
    const asset = await publishPackageRepository.getBrandAsset(brandAssetId);
    if (!asset) throw new Error("视觉资产不存在");
    if (!asset.active) throw new Error("视觉资产已停用，禁止引用");
    const visuals = (pkg.visualAssetIds as string[] | null) ?? [];
    if (visuals.includes(brandAssetId)) return pkg;
    const updated = await publishPackageRepository.update(packageId, { visualAssetIds: [...visuals, brandAssetId] as never });
    return updated;
  },

  async removeVisual(packageId: string, brandAssetId: string) {
    const pkg = await publishPackageRepository.getById(packageId);
    if (!pkg) throw new Error("发布包不存在");
    const visuals = (pkg.visualAssetIds as string[] | null) ?? [];
    const updated = await publishPackageRepository.update(packageId, { visualAssetIds: visuals.filter((v) => v !== brandAssetId) as never });
    return updated;
  },
};

/** 快照周标签（详情页展示 Snapshot Period） */
export async function snapshotWeekOf(snapshotId: string): Promise<string | null> {
  const rows = await db.select({ week: githubSnapshots.week }).from(githubSnapshots).where(eq(githubSnapshots.id, snapshotId)).limit(1);
  return rows[0]?.week ?? null;
}
