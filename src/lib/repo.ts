/**
 * 兼容层（规格 §80）：页面与 action 统一走 Repository 层。
 * 本文件仅做名称转发，保持旧页面 API 不变；新代码请直接 import repositories。
 */
import {
  topicRepository,
  sourceRepository,
  workflowRepository,
  knowledgeRepository,
  githubRepository,
  contentRepository,
  publicationRepository,
  socialAccountRepository,
  connectorRepository,
  metricsRepository,
  leadRepository,
  auditRepository,
} from "@/lib/repositories";
import type { Topic } from "@/lib/db/schema";

/* ============ Topics ============ */

export const listTopics = () => topicRepository.list();
export const getTopicById = (id: string) => topicRepository.getById(id);
export const getTopicByTopicId = (topicId: string) => topicRepository.getByTopicId(topicId);
export const getTopicLineage = (topic: Topic) => topicRepository.getLineage(topic);
export const getDerivedTopics = (topicId: string) => topicRepository.getDerivedTopics(topicId);

/* ============ Sources ============ */

export const getSourcePacketByTopic = (topicId: string) => sourceRepository.getPacketByTopic(topicId);
export const listAllSourcePackets = (limit = 100) => sourceRepository.listPacketsWithTopic(limit);

/* ============ Assets ============ */

export const getAssetsByTopic = (topicId: string) => contentRepository.getAssetsByTopic(topicId);
export const getAssetById = (id: string) => contentRepository.getAssetById(id);
export const listAllAssets = (limit = 200) => contentRepository.listAllAssets(limit);
export const listVersions = (assetId: string) => contentRepository.listVersions(assetId);

/* ============ Workflows ============ */

export const listWorkflowTemplates = () => workflowRepository.listTemplates();
export const listWorkflowRuns = (limit = 100) => workflowRepository.listRuns(limit);
export const listWorkflowRunsWithTopic = (limit = 100) => workflowRepository.listRunsWithTopic(limit);
export const getRunsByTopic = (topicId: string) => workflowRepository.getRunsByTopic(topicId);
export const getRunTasks = (runId: string) => workflowRepository.getRunTasks(runId);

/* ============ Knowledge ============ */

export const listKnowledgeWithTopics = () => knowledgeRepository.listWithTopics();
export const getKnowledgeByTopic = (topicId: string) => knowledgeRepository.getByTopic(topicId);

/* ============ GitHub ============ */

export const listGithubSnapshots = () => githubRepository.listSnapshots();
export const getGithubSnapshot = (snapshotId: string) => githubRepository.getSnapshot(snapshotId);
export const getGithubItems = (snapshotId: string) => githubRepository.getItems(snapshotId);

/* ============ Publications / Metrics ============ */

export const listPublications = () => publicationRepository.list();
export const getMetricsByTopic = (topicId: string) => metricsRepository.getMetricsByTopic(topicId);
export const listAllMetrics = (limit = 200) => metricsRepository.listAllMetrics(limit);

/* ============ Dashboard（聚合统计保留在兼容层） ============ */

export interface DashboardStats {
  topicsByStatus: { status: string; count: number }[];
  topicsByPriority: { priority: string; count: number }[];
  publicationsByStatus: { status: string; count: number }[];
  latestRuns: { type: string; status: string; batchId: string | null; createdAt: Date }[];
  radarCount: number;
  knowledgeCount: number;
  snapshotCount: number;
  leadMetrics: { consultations: number; demoRequests: number; salesLeads: number };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [topics, pubs, runs, radarCount, knowledgeCount, snapshotCount, leadMetrics] = await Promise.all([
    dbStats.topics(),
    dbStats.publications(),
    dbStats.runs(),
    dbStats.radarCount(),
    dbStats.knowledgeCount(),
    dbStats.snapshotCount(),
    dbStats.leadMetrics(),
  ]);
  return {
    topicsByStatus: topics.byStatus,
    topicsByPriority: topics.byPriority,
    publicationsByStatus: pubs,
    latestRuns: runs,
    radarCount,
    knowledgeCount,
    snapshotCount,
    leadMetrics,
  };
}

/* 聚合统计内部实现（复用旧逻辑，独立于 domain repository） */
import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentMetrics, githubSnapshots, knowledgeTopics, publications, topics, trendRadarItems, workflowRuns } from "@/lib/db/schema";

const dbStats = {
  async topics() {
    const [byStatus, byPriority] = await Promise.all([
      db.select({ status: topics.status, count: sql<number>`count(*)::int` }).from(topics).groupBy(topics.status),
      db.select({ priority: topics.priority, count: sql<number>`count(*)::int` }).from(topics).groupBy(topics.priority),
    ]);
    return {
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
      byPriority: byPriority.map((r) => ({ priority: r.priority, count: Number(r.count) })),
    };
  },
  async publications() {
    const rows = await db.select({ status: publications.status, count: sql<number>`count(*)::int` }).from(publications).groupBy(publications.status);
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
  },
  async runs() {
    const rows = await db
      .select({ type: workflowRuns.workflowType, status: workflowRuns.status, batchId: workflowRuns.batchId, createdAt: workflowRuns.createdAt })
      .from(workflowRuns)
      .orderBy(desc(workflowRuns.createdAt));
    return rows as DashboardStats["latestRuns"];
  },
  async radarCount() {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(trendRadarItems);
    return Number(rows[0]?.count ?? 0);
  },
  async knowledgeCount() {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(knowledgeTopics);
    return Number(rows[0]?.count ?? 0);
  },
  async snapshotCount() {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(githubSnapshots);
    return Number(rows[0]?.count ?? 0);
  },
  async leadMetrics() {
    const rows = await db
      .select({
        consultations: sql<number>`coalesce(sum(${contentMetrics.consultations}),0)::int`,
        demoRequests: sql<number>`coalesce(sum(${contentMetrics.demoRequests}),0)::int`,
        salesLeads: sql<number>`coalesce(sum(${contentMetrics.salesLeads}),0)::int`,
      })
      .from(contentMetrics);
    return {
      consultations: Number(rows[0]?.consultations ?? 0),
      demoRequests: Number(rows[0]?.demoRequests ?? 0),
      salesLeads: Number(rows[0]?.salesLeads ?? 0),
    };
  },
};

/* 供新页面使用的统一出口 */
export { topicRepository, sourceRepository, workflowRepository, knowledgeRepository, githubRepository, contentRepository, publicationRepository, socialAccountRepository, connectorRepository, metricsRepository, leadRepository, auditRepository };
