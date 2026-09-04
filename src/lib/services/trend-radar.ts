import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { githubSnapshotItems, githubSnapshots, knowledgeTopics, topics, workflowRuns } from "@/lib/db/schema";
import { contentAssets, externalPosts, topicPerformances } from "@/lib/db/schema";
import { trendRepository } from "@/lib/repositories";
import { trendScoringService, type TrendScoringInput } from "@/lib/services/trend-scoring";
import { notificationService } from "@/lib/services/notification";

/**
 * Trend Radar Service（V3 §10-§16）：
 * 把分散信号（AI Weekly / GitHub Weekly / Topic Bank / 内容表现 / 社交数据 / 知识缺口）
 * 聚合为 Trend Cluster → 归一化去重 → 8 信号评分 → 快照 + 覆盖状态 → 建议生产。
 * 全部真实 DB 读，不做 mock；Trend → Topic 走 Topic Approval Gate，绝不自动生产。
 */

interface TrendEvent {
  key: string;
  title: string;
  category: string;
  sourceType: string;
  seenAt: Date;
  topicId: string | null;
  runId: string | null;
  evidence: string;
}

interface LinkedTopic {
  topicId: string;
  b2b: number | null;
  performance: number | null;
  conversion: number | null;
  hasAsset: boolean;
  hasKnowledge: boolean;
}

export interface TrendRadarRunResult {
  created: number;
  updated: number;
  trends: { id: string; title: string; score: number; status: string }[];
}

const clamp = (v: number, min = 0, max = 10) => Math.max(min, Math.min(max, Math.round(v * 10) / 10));

/** 归一化 trendKey：英文小写 slug / 中文取标签本身 */
function normalizeKey(title: string): string {
  const t = title.trim();
  if (!t) return "untitled";
  if (/^[\x00-\x7F\s-]+$/.test(t)) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "untitled";
  }
  return t.slice(0, 60);
}

export const trendRadarService = {
  /**
   * 全量聚合：读取所有真实来源事件 → 归并趋势 → 评分 → 落库 + 快照。
   * 幂等：同 key 趋势 upsert，来源事件按 (trend, sourceType, topicId|runId) 去重。
   */
  async run(scanWindowDays = 30): Promise<TrendRadarRunResult> {
    const since = new Date(Date.now() - scanWindowDays * 86400000);
    const events = await this.collectEvents(since);

    // 归并
    const grouped = new Map<string, TrendEvent[]>();
    for (const ev of events) {
      const key = normalizeKey(ev.key);
      const list = grouped.get(key) ?? [];
      list.push(ev);
      grouped.set(key, list);
    }

    const result: TrendRadarRunResult = { created: 0, updated: 0, trends: [] };
    for (const [key, evs] of grouped) {
      const primary = evs[0];
      const linked = await this.collectLinkedTopics(evs);

      const scoringInput: TrendScoringInput = {
        trendKey: key,
        title: primary.title,
        category: primary.category,
        eventDates: evs.map((e) => e.seenAt),
        sourceTypes: evs.map((e) => e.sourceType),
        b2bValues: linked.filter((l) => l.b2b != null).map((l) => l.b2b as number),
        performanceValues: linked.filter((l) => l.performance != null).map((l) => l.performance as number),
        conversionValues: linked.filter((l) => l.conversion != null).map((l) => l.conversion as number),
        knowledgeGapCount: linked.filter((l) => !l.hasAsset && !l.hasKnowledge).length,
      };
      const scored = await trendScoringService.scoreTrend(scoringInput);

      const lastSeen = new Date(Math.max(...evs.map((e) => e.seenAt.getTime())));
      const coverage = this.coverageStatus(linked);
      const { trend, created } = await trendRepository.upsertTrend({
        trendKey: key,
        title: primary.title.slice(0, 300),
        description: evs.slice(0, 3).map((e) => e.evidence).join("；") || null,
        category: primary.category,
        status: scored.status,
        lastSeenAt: lastSeen,
        currentScore: String(scored.currentScore),
        velocityScore: String(scored.velocityScore),
        sourceDiversity: String(scored.sourceDiversity),
        b2bRelevance: scored.b2bRelevance,
        coverageStatus: coverage,
        scoreBreakdown: scored.breakdown as never,
        configVersion: scored.configVersion,
      });

      // 来源证据（去重）
      for (const ev of evs) {
        await trendRepository.upsertSource({
          trendId: trend.id,
          sourceType: ev.sourceType,
          sourceTopicId: ev.topicId,
          workflowRunId: ev.runId,
          weight: String(clamp(evs.length / 10, 0, 1)),
          evidence: ev.evidence.slice(0, 500),
          seenAt: ev.seenAt,
        });
      }
      // 关联 Topic（covered 关系）
      for (const l of linked) await trendRepository.addTopic(trend.id, l.topicId, "covered");

      // 时间线快照
      await trendRepository.createSnapshot({
        trendId: trend.id,
        snapshotDate: new Date(),
        currentScore: String(scored.currentScore),
        velocityScore: String(scored.velocityScore),
        sourceCount: evs.length,
        coveredTopicCount: linked.filter((l) => l.hasAsset || l.hasKnowledge).length,
        signals: scored.breakdown as never,
      });

      if (created) result.created++;
      else result.updated++;
      result.trends.push({ id: trend.id, title: primary.title, score: scored.currentScore, status: scored.status });

      // P0 趋势通知（score >= 9）
      if (scored.currentScore >= 9) {
        await notificationService.notify({
          type: "trend_p0_detected",
          title: `P0 趋势「${primary.title.slice(0, 30)}」`,
          message: `趋势分 ${scored.currentScore}（${scored.status}），建议本周生产。`,
          link: `/trend-radar/${trend.id}`,
          entityType: "trends",
          entityId: trend.id,
          severity: "warning",
        });
      }
    }
    return result;
  },

  /** 从真实数据收集来源事件（扫描窗口内） */
  async collectEvents(since: Date): Promise<TrendEvent[]> {
    const events: TrendEvent[] = [];

    // 1) Topic Bank：trend tags + trend 类型（knowledge 来源）
    const taggedTopics = await db.select().from(topics).where(sql`${topics.trendTags} IS NOT NULL`);
    for (const t of taggedTopics) {
      for (const tag of t.trendTags ?? []) {
        events.push({
          key: tag, title: tag, category: "topic_bank",
          sourceType: "knowledge", seenAt: t.updatedAt, topicId: t.id, runId: null,
          evidence: `Topic「${t.title.slice(0, 40)}」携带趋势标签「${tag}」`,
        });
      }
    }

    // 2) GitHub Weekly：最新快照 selected 项（github_weekly 来源）
    const snapshots = await db.select().from(githubSnapshots).orderBy(sql`${githubSnapshots.captureTime} desc`).limit(3);
    if (snapshots.length) {
      const items = await db
        .select()
        .from(githubSnapshotItems)
        .where(sql`${githubSnapshotItems.snapshotId} = ${snapshots[0].id} and ${githubSnapshotItems.selected} = true`);
      for (const it of items) {
        events.push({
          key: it.projectName ?? it.repository, title: `${it.projectName ?? it.repository}（GitHub 周榜）`, category: "tech",
          sourceType: "github_weekly", seenAt: snapshots[0].captureTime, topicId: null, runId: null,
          evidence: `GitHub 周榜 #${it.rank}：${it.repository}（★${it.totalStars ?? "—"}，周增 ${it.weeklyGrowth ?? "—"}）`,
        });
      }
    }

    // 3) AI Weekly：近期 completed 的 ai_weekly run（ai_weekly 来源）
    const weeklyRuns = await db
      .select({ run: workflowRuns, topic: topics })
      .from(workflowRuns)
      .leftJoin(topics, sql`${workflowRuns.topicId} = ${topics.id}`)
      .where(sql`${workflowRuns.workflowType} = 'ai_weekly' and ${workflowRuns.createdAt} >= ${since}`)
      .orderBy(sql`${workflowRuns.createdAt} desc`)
      .limit(20);
    for (const r of weeklyRuns) {
      if (!r.topic) continue;
      events.push({
        key: r.topic.title, title: r.topic.title, category: "ai_weekly",
        sourceType: "ai_weekly", seenAt: r.run.createdAt, topicId: r.topic.id, runId: r.run.id,
        evidence: `AI 周报 run（${r.run.status}）：${r.topic.title.slice(0, 60)}`,
      });
    }

    // 4) Content Performance：近 2 周期表现靠前的 Topic（content_performance 来源）
    const perfRows = await db.select().from(topicPerformances).orderBy(sql`${topicPerformances.performanceScore} desc nulls last`).limit(15);
    const perfTopics = await db.select().from(topics).where(sql`${topics.id} in (${sql.join(perfRows.map((p) => sql`${p.topicId}`), sql`, `)})`);
    const perfByTopic = new Map(perfRows.map((p) => [p.topicId, p]));
    for (const t of perfTopics) {
      const p = perfByTopic.get(t.id);
      if (!p || Number(p.performanceScore ?? 0) < 5) continue;
      events.push({
        key: t.title, title: t.title, category: "content_perf",
        sourceType: "content_performance", seenAt: p.createdAt, topicId: t.id, runId: null,
        evidence: `内容表现 ${p.performanceScore}（traffic ${p.trafficScore}/conv ${p.conversionScore}）`,
      });
    }

    // 5) Social Data：高表现外部作品（social_data 来源）
    const hotPosts = await db.select().from(externalPosts).where(sql`${externalPosts.publishedAt} >= ${since}`).limit(200);
    const postIds = hotPosts.map((p) => p.id);
    const postViews = new Map<string, number>();
    if (postIds.length) {
      const snapRows = await db.execute(sql`
        select "external_post_id", max("views") as views
        from post_metric_snapshots
        where "external_post_id" in (${sql.join(postIds.map((id) => sql`${id}`), sql`, `)})
        group by "external_post_id"
      `);
      for (const r of snapRows as unknown as { external_post_id: string; views: number }[]) {
        postViews.set(r.external_post_id, Number(r.views ?? 0));
      }
    }
    for (const p of hotPosts) {
      const views = postViews.get(p.id) ?? 0;
      if (views < 5000) continue;
      events.push({
        key: p.title ?? p.externalPostId, title: (p.title ?? p.externalPostId).slice(0, 120), category: "social",
        sourceType: "social_data", seenAt: p.publishedAt ?? p.createdAt, topicId: null, runId: null,
        evidence: `作品「${(p.title ?? p.externalPostId).slice(0, 50)}」播放 ${views}（${p.platform}）`,
      });
    }

    return events;
  },

  /** 关联 Topic 画像：b2b / 表现 / 转化 / 内容与知识覆盖（coverage 与 gap 信号） */
  async collectLinkedTopics(evs: TrendEvent[]): Promise<LinkedTopic[]> {
    const topicIds = [...new Set(evs.map((e) => e.topicId).filter((x): x is string => !!x))];
    if (!topicIds.length) return [];
    const out: LinkedTopic[] = [];
    for (const id of topicIds) {
      const [topic, perf, assets, knowledge] = await Promise.all([
        db.select().from(topics).where(sql`${topics.id} = ${id}`).limit(1),
        db.select().from(topicPerformances).where(sql`${topicPerformances.topicId} = ${id}`).orderBy(sql`${topicPerformances.performanceScore} desc nulls last`).limit(1),
        db.select().from(contentAssets).where(sql`${contentAssets.topicId} = ${id}`).limit(1),
        db.select().from(knowledgeTopics).where(sql`${knowledgeTopics.topicId} = ${id}`).limit(1),
      ]);
      if (!topic[0]) continue;
      out.push({
        topicId: id,
        b2b: topic[0].b2bRelevance,
        performance: perf[0] ? Number(perf[0].performanceScore) : null,
        conversion: perf[0] ? Number(perf[0].conversionScore) : null,
        hasAsset: assets.length > 0,
        hasKnowledge: knowledge.length > 0,
      });
    }
    return out;
  },

  /** 覆盖状态：uncovered / partial / covered / saturated */
  coverageStatus(linked: LinkedTopic[]): "uncovered" | "partial" | "covered" | "saturated" {
    if (!linked.length) return "uncovered";
    const coveredCount = linked.filter((l) => l.hasAsset || l.hasKnowledge).length;
    const ratio = coveredCount / linked.length;
    if (ratio === 0) return "uncovered";
    if (ratio < 0.5) return "partial";
    if (ratio < 0.9) return "covered";
    return "saturated";
  },

  /** 单趋势重算（V3 §16 Error Recovery）：按已有 sources 重新评分 + 落快照 */
  async recalcTrend(trendId: string) {
    const trend = await trendRepository.getTrend(trendId);
    if (!trend) throw new Error(`趋势 ${trendId} 不存在`);

    const sources = await trendRepository.listSources(trendId, 200);
    const links = await trendRepository.listTopics(trendId);
    const eventDates = sources.map((s) => s.source.seenAt);
    const perfTopics = links.filter((l) => l.topic).slice(0, 20);
    const linked: LinkedTopic[] = perfTopics.map((l) => ({
      topicId: l.topic.id,
      b2b: l.topic.b2bRelevance,
      performance: null,
      conversion: null,
      hasAsset: false,
      hasKnowledge: false,
    }));
    for (const l of linked) {
      const [assets, knowledge] = await Promise.all([
        db.select().from(contentAssets).where(sql`${contentAssets.topicId} = ${l.topicId}`).limit(1),
        db.select().from(knowledgeTopics).where(sql`${knowledgeTopics.topicId} = ${l.topicId}`).limit(1),
      ]);
      l.hasAsset = assets.length > 0;
      l.hasKnowledge = knowledge.length > 0;
      const perf = await db
        .select()
        .from(topicPerformances)
        .where(sql`${topicPerformances.topicId} = ${l.topicId}`)
        .orderBy(sql`${topicPerformances.performanceScore} desc nulls last`)
        .limit(1);
      if (perf[0]) {
        l.performance = Number(perf[0].performanceScore);
        l.conversion = Number(perf[0].conversionScore);
      }
    }

    const scored = await trendScoringService.scoreTrend({
      trendKey: trend.trendKey,
      title: trend.title,
      category: trend.category ?? undefined,
      eventDates,
      sourceTypes: sources.map((s) => s.source.sourceType),
      b2bValues: linked.filter((l) => l.b2b != null).map((l) => l.b2b as number),
      performanceValues: linked.filter((l) => l.performance != null).map((l) => l.performance as number),
      conversionValues: linked.filter((l) => l.conversion != null).map((l) => l.conversion as number),
      knowledgeGapCount: linked.filter((l) => !l.hasAsset && !l.hasKnowledge).length,
    });

    const updated = await trendRepository.updateTrend(trendId, {
      status: scored.status,
      lastSeenAt: eventDates.length ? new Date(Math.max(...eventDates.map((d) => d.getTime()))) : trend.lastSeenAt,
      currentScore: String(scored.currentScore),
      velocityScore: String(scored.velocityScore),
      sourceDiversity: String(scored.sourceDiversity),
      b2bRelevance: scored.b2bRelevance,
      coverageStatus: this.coverageStatus(linked),
      scoreBreakdown: scored.breakdown as never,
      configVersion: scored.configVersion,
    });
    await trendRepository.createSnapshot({
      trendId,
      snapshotDate: new Date(),
      currentScore: String(scored.currentScore),
      velocityScore: String(scored.velocityScore),
      sourceCount: sources.length,
      coveredTopicCount: linked.filter((l) => l.hasAsset || l.hasKnowledge).length,
      signals: scored.breakdown as never,
    });
    return { trend: updated, scored };
  },

  /**
   * 建议生产 Topic（weekly planning 的 trend 输入）：按趋势分排序取 Top N，
   * 返回已关联 Topic（复用）与未覆盖趋势（新建 Topic 建议）。
   */
  async suggestedTopics(limit = 5) {
    const rows = await trendRepository.listTrendsWithStats({ limit: 50 });
    const out: { trendId: string; trendKey: string; title: string; score: number; status: string; existingTopicIds: string[]; coverage: string }[] = [];
    for (const { trend } of rows) {
      const links = await trendRepository.listTopics(trend.id);
      const existingTopicIds = links.map((l) => l.topic.id);
      out.push({
        trendId: trend.id,
        trendKey: trend.trendKey,
        title: trend.title,
        score: Number(trend.currentScore ?? 0),
        status: trend.status,
        existingTopicIds,
        coverage: trend.coverageStatus,
      });
    }
    return out.filter((t) => t.coverage !== "saturated").sort((a, b) => b.score - a.score).slice(0, limit);
  },
};
