import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAssetsByTopic,
  getMetricsByTopic,
  getRunsByTopic,
  getSourcePacketByTopic,
  getTopicById,
  getTopicLineage,
  getDerivedTopics,
  getKnowledgeByTopic,
} from "@/lib/repo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/ui/timeline";
import { Progress } from "@/components/ui/progress";
import { fmtDate, fmtNum } from "@/lib/format";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  ASSET_TYPE_LABELS,
  CONTENT_ROLE_LABELS,
  DEDUPE_LABELS,
  KNOWLEDGE_CONTENT_STATUS_LABELS,
  KNOWLEDGE_STATUS_LABELS,
  PLATFORM_LABELS,
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
  SOURCE_TYPE_LABELS,
  TOPIC_STATUS_LABELS,
  TOPIC_STATUS_TONES,
  TOPIC_TYPE_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_TONES,
} from "@/lib/labels";
import { TopicStatusAction } from "@/components/topics/topic-status-action";

export const dynamic = "force-dynamic";

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = await getTopicById(id);
  if (!topic) notFound();

  const [lineage, packet, runs, assets, metrics, derived, knowledge] = await Promise.all([
    getTopicLineage(topic),
    getSourcePacketByTopic(topic.id),
    getRunsByTopic(topic.id),
    getAssetsByTopic(topic.id),
    getMetricsByTopic(topic.id),
    getDerivedTopics(topic.id),
    getKnowledgeByTopic(topic.id),
  ]);

  const scores = [
    { label: "B2B 相关性", value: topic.b2bRelevance },
    { label: "流量潜力", value: topic.trafficPotential },
    { label: "转化潜力", value: topic.conversionPotential },
    { label: "时效性", value: topic.timeliness },
    { label: "内容价值", value: topic.contentValue },
  ];
  const avgScore = scores.filter((s) => s.value).reduce((a, s) => a + (s.value ?? 0), 0) / (scores.filter((s) => s.value).length || 1);

  return (
    <div className="space-y-4 p-4">
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{topic.title}</h1>
            <PriorityBadge priority={topic.priority} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="font-mono">{topic.topicId}</span>
            <StatusBadge label={TOPIC_TYPE_LABELS[topic.topicType]} tone="outline" />
            <StatusBadge label={TOPIC_STATUS_LABELS[topic.status]} tone={TOPIC_STATUS_TONES[topic.status]} />
            {topic.trendTags?.map((t) => <Badge key={t} variant="outline">#{t}</Badge>)}
            <span>查重：{DEDUPE_LABELS[topic.historyDedupeStatus] ?? topic.historyDedupeStatus}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TopicStatusAction topicId={topic.id} status={topic.status} />
          <Button variant="outline" size="sm">编辑</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左列：评分 + 血缘 + CTA */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>评分</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {scores.map((s) => (
                <div key={s.label}>
                  <div className="mb-0.5 flex justify-between text-[11px] text-zinc-500">
                    <span>{s.label}</span>
                    <span className="tabular font-medium">{s.value ?? "—"} / 10</span>
                  </div>
                  <Progress value={((s.value ?? 0) / 10) * 100} />
                </div>
              ))}
              <div className="mt-2 border-t border-zinc-100 pt-2 text-right text-xs text-zinc-500">
                综合分 <span className="tabular font-semibold text-blue-700">{avgScore.toFixed(1)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>主 CTA</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
                {topic.primaryCta ?? "未设置"}
              </div>
              {topic.businessRelevance && (
                <p className="mt-2 text-xs text-zinc-500">业务相关性：{topic.businessRelevance}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Topic 血缘</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <div className="mb-1 text-[11px] font-medium text-zinc-500">Parent Topic</div>
                {lineage.parent ? (
                  <Link href={`/topics/${lineage.parent.id}`} className="text-blue-600 hover:underline">
                    {lineage.parent.title} <span className="text-zinc-400">({lineage.parent.topicId})</span>
                  </Link>
                ) : <span className="text-zinc-400">无（根 Topic）</span>}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-zinc-500">Source Topics（{lineage.sources.length}）</div>
                {lineage.sources.length ? (
                  <ul className="space-y-1">
                    {lineage.sources.map((s) => (
                      <li key={s.id}>
                        <Link href={`/topics/${s.id}`} className="text-blue-600 hover:underline">{s.title}</Link>
                      </li>
                    ))}
                  </ul>
                ) : <span className="text-zinc-400">无</span>}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-zinc-500">Derived Topics（{derived.length}）</div>
                {derived.length ? (
                  <ul className="space-y-1">
                    {derived.map((d) => (
                      <li key={d.id}>
                        <Link href={`/topics/${d.id}`} className="text-blue-600 hover:underline">
                          {d.title} <span className="text-zinc-400">({d.topicId})</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <span className="text-zinc-400">暂无衍生</span>}
              </div>
            </CardContent>
          </Card>

          {knowledge && (
            <Card>
              <CardHeader><CardTitle>知识库记录</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-zinc-500">知识状态</span>
                  <StatusBadge label={KNOWLEDGE_STATUS_LABELS[knowledge.knowledgeStatus]} tone={VERIFICATION_TONES[knowledge.knowledgeStatus]} /></div>
                <div className="flex justify-between"><span className="text-zinc-500">内容状态</span>
                  <StatusBadge label={KNOWLEDGE_CONTENT_STATUS_LABELS[knowledge.contentStatus]} tone="blue" /></div>
                <div className="flex justify-between"><span className="text-zinc-500">分类</span><span>{knowledge.category ?? "—"}</span></div>
                {(() => {
                  const ups = knowledge.upstreamConcepts ?? [];
                  const downs = knowledge.downstreamConcepts ?? [];
                  return (
                    <>
                      {ups.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {ups.map((c: string) => <Badge key={c} variant="outline">上游·{c}</Badge>)}
                        </div>
                      )}
                      {downs.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {downs.map((c: string) => <Badge key={c} variant="outline">下游·{c}</Badge>)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右两列：来源 / 工作流 / 资产 / 指标 */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Source Packet</CardTitle>
                <Link href={`/sources?topic=${topic.id}`}><Button variant="ghost" size="sm">管理来源</Button></Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!packet ? (
                <p className="text-xs text-zinc-400">尚未采集来源。进入「来源与核验」为该 Topic 建立 Source Packet。</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs">
                    <StatusBadge label={`一致性：${VERIFICATION_LABELS[packet.packet.consistency]}`}
                      tone={VERIFICATION_TONES[packet.packet.consistency]} />
                    <span className="text-zinc-400">共 {packet.items.length} 条来源</span>
                  </div>
                  {packet.items.map((item) => (
                    <div key={item.id} className="rounded-md border border-zinc-100 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{item.sourceName}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-400">
                            {SOURCE_TYPE_LABELS[item.sourceType]} · 发布 {fmtDate(item.publishedAt)}
                            {item.eventDate ? ` · 事件 ${fmtDate(item.eventDate)}` : ""}
                          </div>
                        </div>
                        <StatusBadge label={VERIFICATION_LABELS[item.verificationStatus]} tone={VERIFICATION_TONES[item.verificationStatus]} />
                      </div>
                      {item.coreFacts && <p className="mt-1.5 text-xs text-zinc-600">{item.coreFacts}</p>}
                      {Boolean(item.keyNumbers) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {Object.entries(item.keyNumbers as Record<string, unknown>).map(([k, v]) => (
                            <Badge key={k} variant="blue">{k}: {String(v)}</Badge>
                          ))}
                        </div>
                      )}
                      {item.numberTestConditions && (
                        <p className="mt-1 text-[10px] text-zinc-400">测试条件：{item.numberTestConditions}</p>
                      )}
                      {item.sourceUrl && (
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-blue-600 hover:underline">
                          {item.sourceUrl} ↗
                        </a>
                      )}
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Workflow Runs</CardTitle></CardHeader>
            <CardContent>
              {!runs.length ? (
                <p className="text-xs text-zinc-400">暂无工作流执行记录。</p>
              ) : (
                <Timeline
                  items={runs.map((r) => ({
                    time: fmtDate(r.createdAt),
                    title: `${r.workflowType}${r.batchId ? ` · ${r.batchId}` : ""}`,
                    tone: r.status === "completed" ? "green" : r.status === "failed" ? "red" : r.status === "running" ? "blue" : r.status === "needs_review" ? "orange" : "default",
                    content: (
                      <div className="flex items-center gap-2">
                        <StatusBadge label={RUN_STATUS_LABELS[r.status]} tone={RUN_STATUS_TONES[r.status]} />
                        {r.error && <span className="text-red-500">{r.error}</span>}
                      </div>
                    ),
                  }))}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Content Assets（{assets.length}）</CardTitle>
                <Link href={`/content?topic=${topic.id}`}><Button variant="ghost" size="sm">全部资产</Button></Link>
              </div>
            </CardHeader>
            <CardContent>
              {!assets.length ? (
                <p className="text-xs text-zinc-400">尚未生成内容资产。</p>
              ) : (
                <div className="space-y-2">
                  {assets.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{a.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
                          {ASSET_TYPE_LABELS[a.assetType]}
                          {a.platform ? ` · ${PLATFORM_LABELS[a.platform]}` : ""}
                          {a.contentRole ? ` · ${CONTENT_ROLE_LABELS[a.contentRole]}` : ""}
                          {a.version > 1 ? ` · v${a.version}` : ""}
                        </div>
                      </div>
                      <StatusBadge label={ASSET_STATUS_LABELS[a.status]} tone={ASSET_STATUS_TONES[a.status]} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Metrics（绑定 Topic_ID）</CardTitle></CardHeader>
            <CardContent>
              {!metrics.length ? (
                <p className="text-xs text-zinc-400">暂无回填数据。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                        <th className="py-1 pr-2">日期</th>
                        <th className="py-1 pr-2">阅读</th>
                        <th className="py-1 pr-2">CTA 点击</th>
                        <th className="py-1 pr-2">收藏</th>
                        <th className="py-1 pr-2">分享</th>
                        <th className="py-1 pr-2">评论</th>
                        <th className="py-1 pr-2">Demo</th>
                        <th className="py-1">Leads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => (
                        <tr key={m.id} className="border-b border-zinc-50 tabular">
                          <td className="py-1.5 pr-2 text-zinc-500">{m.metricDate ? new Date(m.metricDate).toLocaleDateString("zh-CN") : "—"}</td>
                          <td className="py-1.5 pr-2">{fmtNum(m.reads)}</td>
                          <td className="py-1.5 pr-2">{fmtNum(m.ctaClicks)}</td>
                          <td className="py-1.5 pr-2">{fmtNum(m.saveCount)}</td>
                          <td className="py-1.5 pr-2">{fmtNum(m.shareCount)}</td>
                          <td className="py-1.5 pr-2">{fmtNum(m.commentCount)}</td>
                          <td className="py-1.5 pr-2">{fmtNum(m.demoRequests)}</td>
                          <td className="py-1.5">{fmtNum(m.salesLeads)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>历史记录</CardTitle></CardHeader>
            <CardContent>
              <Timeline
                items={[
                  { time: fmtDate(topic.createdAt), title: "Topic 创建", tone: "blue" },
                  { time: fmtDate(topic.updatedAt), title: `最近更新：状态 → ${TOPIC_STATUS_LABELS[topic.status]}`, tone: "default" },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
