import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  trendScoringConfig,
  trendSnapshots,
  trendSources,
  trendTopics,
  trends,
  topics,
  type Trend,
} from "@/lib/db/schema";

/**
 * Trend Repository（V3）：趋势聚合实体 / 来源证据 / 覆盖 Topic / 时间线快照 / 评分配置。
 * 页面不直接写 Drizzle（规格 §37）。
 */
export const trendRepository = {
  /* ===== Trends ===== */
  async listTrends(opts?: { status?: string; limit?: number; orderBy?: "score" | "last_seen" }) {
    const rows = await db
      .select()
      .from(trends)
      .where(opts?.status ? eq(trends.status, opts.status as never) : undefined)
      .orderBy(opts?.orderBy === "last_seen" ? desc(trends.lastSeenAt) : desc(trends.currentScore))
      .limit(opts?.limit ?? 100);
    return rows;
  },

  /** 详情路由接受业务 ID（trend_key）或 UUID，禁止对非 UUID 抛 PG 22P02 */
  async getTrend(id: string) {
    // PostgreSQL 对 or() 两侧都会做 uuid 类型转换，非 UUID 输入会抛 22P02，
    // 因此先用正则判断再决定是否参与 id 比较。
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const cond = isUuid ? or(eq(trends.id, id), eq(trends.trendKey, id)) : eq(trends.trendKey, id);
    const rows = await db.select().from(trends).where(cond).limit(1);
    return rows[0] ?? null;
  },

  async getTrendByKey(trendKey: string) {
    const rows = await db.select().from(trends).where(eq(trends.trendKey, trendKey)).limit(1);
    return rows[0] ?? null;
  },

  async createTrend(input: Partial<Omit<Trend, "id" | "createdAt" | "updatedAt">> & { trendKey: string; title: string }) {
    const rows = await db.insert(trends).values(input as typeof trends.$inferInsert).returning();
    return rows[0];
  },

  async updateTrend(id: string, patch: Partial<Omit<Trend, "id" | "createdAt">>) {
    const rows = await db
      .update(trends)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(trends.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /** 按 trendKey upsert：存在则更新信号并返回 existing 标记 */
  async upsertTrend(input: Partial<Omit<Trend, "id" | "createdAt" | "updatedAt">> & { trendKey: string; title: string }) {
    const existing = await this.getTrendByKey(input.trendKey);
    if (existing) {
      const rows = await db
        .update(trends)
        .set({
          title: input.title ?? existing.title,
          description: input.description ?? existing.description,
          category: input.category ?? existing.category,
          status: input.status ?? existing.status,
          firstSeenAt: existing.firstSeenAt,
          lastSeenAt: input.lastSeenAt ?? existing.lastSeenAt,
          currentScore: input.currentScore ?? existing.currentScore,
          velocityScore: input.velocityScore ?? existing.velocityScore,
          b2bRelevance: input.b2bRelevance ?? existing.b2bRelevance,
          sourceDiversity: input.sourceDiversity ?? existing.sourceDiversity,
          coverageStatus: input.coverageStatus ?? existing.coverageStatus,
          scoreBreakdown: input.scoreBreakdown ?? existing.scoreBreakdown,
          configVersion: input.configVersion ?? existing.configVersion,
          updatedAt: new Date(),
        })
        .where(eq(trends.id, existing.id))
        .returning();
      return { trend: rows[0], created: false };
    }
    const rows = await db
      .insert(trends)
      .values(input as typeof trends.$inferInsert)
      .returning();
    return { trend: rows[0], created: true };
  },

  /* ===== Trend Sources（来源证据） ===== */
  async listSources(trendId: string, limit = 100) {
    return db
      .select({ source: trendSources, topic: topics })
      .from(trendSources)
      .leftJoin(topics, eq(trendSources.sourceTopicId, topics.id))
      .where(eq(trendSources.trendId, trendId))
      .orderBy(desc(trendSources.seenAt))
      .limit(limit);
  },

  async createSource(input: typeof trendSources.$inferInsert) {
    const rows = await db.insert(trendSources).values(input).returning();
    return rows[0];
  },

  /** 去重：同 trend + sourceType + topicId（或 runId）只记一条（同事件重复出现只更新 seenAt） */
  async upsertSource(input: typeof trendSources.$inferInsert) {
    const candidates = await db
      .select()
      .from(trendSources)
      .where(and(eq(trendSources.trendId, input.trendId), eq(trendSources.sourceType, input.sourceType)));
    const existing = candidates.find(
      (c) => (input.sourceTopicId ? c.sourceTopicId === input.sourceTopicId : c.sourceTopicId === null) && (input.workflowRunId ? c.workflowRunId === input.workflowRunId : c.workflowRunId === null),
    );
    if (existing) {
      const rows = await db
        .update(trendSources)
        .set({ evidence: input.evidence ?? existing.evidence, seenAt: input.seenAt ?? existing.seenAt, weight: input.weight ?? existing.weight })
        .where(eq(trendSources.id, existing.id))
        .returning();
      return { source: rows[0], created: false };
    }
    const rows = await db.insert(trendSources).values(input).returning();
    return { source: rows[0], created: true };
  },

  /* ===== Trend Topics（覆盖关系） ===== */
  async listTopics(trendId: string) {
    return db
      .select({ tt: trendTopics, topic: topics })
      .from(trendTopics)
      .innerJoin(topics, eq(trendTopics.topicId, topics.id))
      .where(eq(trendTopics.trendId, trendId))
      .orderBy(asc(trendTopics.createdAt));
  },

  async addTopic(trendId: string, topicId: string, relation = "covered") {
    const rows = await db
      .insert(trendTopics)
      .values({ trendId, topicId, relation })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  },

  async listTrendIdsByTopic(topicId: string) {
    const rows = await db
      .select({ trendId: trendTopics.trendId })
      .from(trendTopics)
      .where(eq(trendTopics.topicId, topicId));
    return rows.map((r) => r.trendId);
  },

  /* ===== Trend Snapshots（时间线） ===== */
  async createSnapshot(input: typeof trendSnapshots.$inferInsert) {
    const rows = await db.insert(trendSnapshots).values(input).returning();
    return rows[0];
  },

  async listSnapshots(trendId: string, limit = 60) {
    return db
      .select()
      .from(trendSnapshots)
      .where(eq(trendSnapshots.trendId, trendId))
      .orderBy(asc(trendSnapshots.snapshotDate))
      .limit(limit);
  },

  /* ===== Trend Scoring Config（权重可配置，不写死） ===== */
  async getActiveConfig() {
    const rows = await db
      .select()
      .from(trendScoringConfig)
      .where(eq(trendScoringConfig.active, 1))
      .orderBy(desc(trendScoringConfig.updatedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async createConfig(input: typeof trendScoringConfig.$inferInsert) {
    const rows = await db.insert(trendScoringConfig).values(input).returning();
    return rows[0];
  },

  /* ===== 聚合查询 ===== */

  /** 全量趋势（含来源类型统计），供雷达页展示 */
  async listTrendsWithStats(opts?: { limit?: number }) {
    const list = await this.listTrends({ limit: opts?.limit ?? 100, orderBy: "score" });
    const stats = await db
      .select({ trendId: trendSources.trendId, sourceType: trendSources.sourceType, count: sql<number>`count(*)::int` })
      .from(trendSources)
      .groupBy(trendSources.trendId, trendSources.sourceType);
    const byTrend = new Map<string, { types: string[]; count: number }>();
    for (const s of stats) {
      const cur = byTrend.get(s.trendId) ?? { types: [], count: 0 };
      cur.types.push(s.sourceType);
      cur.count += s.count;
      byTrend.set(s.trendId, cur);
    }
    return list.map((t) => ({ trend: t, sourceStats: byTrend.get(t.id) ?? { types: [], count: 0 } }));
  },
};
