import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * V4 数据导出（规格 §31）：Topics / Publications / Topic Performance / Social Metrics → CSV 下载。
 * GET /api/export?type=topics|publications|topic_performance|social_metrics
 * 认证由 src/proxy.ts 统一保护（配置凭证后）。
 */

function toCsv(headers: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

async function query(text: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  return (await db.execute(text)) as unknown as Record<string, unknown>[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "topics";

  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (type === "topics") {
    const data = await query(sql`
      SELECT t.topic_id, t.title, t.status, t.topic_type, t.priority,
             t.created_at, tp.performance_score, tp.recommendation
      FROM topics t
      LEFT JOIN topic_performances tp ON tp.topic_id = t.id
      ORDER BY t.created_at DESC
    `);
    headers = ["topic_id", "title", "status", "topic_type", "priority", "created_at", "performance_score", "recommendation"];
    rows = data.map((r) => [r.topic_id, r.title, r.status, r.topic_type, r.priority, r.created_at, r.performance_score, r.recommendation]);
  } else if (type === "publications") {
    const data = await query(sql`
      SELECT t.topic_id, p.platform, p.status, p.scheduled_date, p.published_date, p.published_url, p.data_source, p.historical_import
      FROM publications p
      JOIN topics t ON t.id = p.topic_id
      ORDER BY p.created_at DESC
    `);
    headers = ["topic_id", "platform", "status", "scheduled_date", "published_date", "published_url", "data_source", "historical_import"];
    rows = data.map((r) => [r.topic_id, r.platform, r.status, r.scheduled_date, r.published_date, r.published_url, r.data_source, r.historical_import]);
  } else if (type === "topic_performance") {
    const data = await query(sql`
      SELECT t.topic_id, s.period, s.traffic_score, s.engagement_score, s.follower_score, s.lead_score,
             s.conversion_score, s.trend_score, s.performance_score, s.recommendation, s.reason_codes, s.data_source
      FROM topic_performance_scores s
      JOIN topics t ON t.id = s.topic_id
      ORDER BY s.period DESC, t.topic_id
    `);
    headers = ["topic_id", "period", "traffic", "engagement", "follower", "lead", "conversion", "trend", "performance", "recommendation", "reason_codes", "data_source"];
    rows = data.map((r) => [r.topic_id, r.period, r.traffic_score, r.engagement_score, r.follower_score, r.lead_score, r.conversion_score, r.trend_score, r.performance_score, r.recommendation, Array.isArray(r.reason_codes) ? (r.reason_codes as string[]).join("|") : r.reason_codes, r.data_source]);
  } else if (type === "social_metrics") {
    const data = await query(sql`
      SELECT ep.external_post_id, ep.platform, ep.title, s.captured_at, s.views, s.likes, s.comments, s.shares, s.saves, ep.data_source
      FROM post_metric_snapshots s
      JOIN external_posts ep ON ep.id = s.external_post_id
      ORDER BY s.captured_at DESC
    `);
    headers = ["external_post_id", "platform", "title", "captured_at", "views", "likes", "comments", "shares", "saves", "data_source"];
    rows = data.map((r) => [r.external_post_id, r.platform, r.title, r.captured_at, r.views, r.likes, r.comments, r.shares, r.saves, r.data_source]);
  } else {
    return NextResponse.json({ ok: false, error: `未知导出类型：${type}（支持 topics/publications/topic_performance/social_metrics）` }, { status: 400 });
  }

  return new NextResponse("﻿" + toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contentos-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
