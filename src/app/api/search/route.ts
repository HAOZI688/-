import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentAssets, publications, topics, trends } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export interface SearchResultGroup {
  key: "topics" | "trends" | "assets" | "publications";
  label: string;
  items: { title: string; subtitle?: string; href: string }[];
}

/**
 * Global Search（V3 §5）：真实 DB 全文模糊检索（ILIKE，全站统一入口）。
 * POST { q } → 四类分组结果（Topic 用业务 ID 链接，Trend 用内部 UUID 链接）。
 */
export async function POST(req: Request) {
  const { q } = (await req.json().catch(() => ({ q: "" }))) as { q?: string };
  const kw = (q ?? "").trim();
  if (!kw) return NextResponse.json({ groups: [] });

  const like = `%${kw}%`;
  const [topicRows, trendRows, assetRows, pubRows] = await Promise.all([
    db.select().from(topics).where(sql`${topics.title} ilike ${like}`).limit(8),
    db.select().from(trends).where(sql`${trends.title} ilike ${like}`).limit(5),
    db.select({ id: contentAssets.id, title: contentAssets.title, topicId: contentAssets.topicId })
      .from(contentAssets)
      .where(sql`${contentAssets.title} ilike ${like}`)
      .limit(5),
    db.select({ id: publications.id, topicId: publications.topicId })
      .from(publications)
      .where(sql`${publications.topicId} in (select id from topics where title ilike ${like})`)
      .limit(5),
  ]);

  const groups: SearchResultGroup[] = [];
  if (topicRows.length) {
    groups.push({
      key: "topics",
      label: `Topic（${topicRows.length}）`,
      items: topicRows.map((t) => ({
        title: `${t.topicId} · ${t.title}`,
        subtitle: `${t.status} · ${t.priority}`,
        href: `/topics/${t.topicId}`,
      })),
    });
  }
  if (trendRows.length) {
    groups.push({
      key: "trends",
      label: `趋势雷达（${trendRows.length}）`,
      items: trendRows.map((t) => ({
        title: t.title,
        subtitle: `综合分 ${t.currentScore ?? "—"} · ${t.status}`,
        href: `/trend-radar/${t.trendKey}`,
      })),
    });
  }
  if (assetRows.length) {
    groups.push({
      key: "assets",
      label: `内容资产（${assetRows.length}）`,
      items: assetRows.map((a) => ({
        title: a.title,
        subtitle: `Topic ${a.topicId?.slice(0, 8)}`,
        href: `/content/${a.topicId}`,
      })),
    });
  }
  if (pubRows.length) {
    groups.push({
      key: "publications",
      label: `发布计划（${pubRows.length}）`,
      items: pubRows.map((p) => ({
        title: `发布计划 ${p.id.slice(0, 8)}`,
        subtitle: `Topic ${p.topicId?.slice(0, 8)}`,
        href: `/publications`,
      })),
    });
  }

  return NextResponse.json({ q: kw, groups });
}
