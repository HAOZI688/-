import { topicRepository, connectorRepository, publicationRepository } from "@/lib/repositories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import Link from "next/link";
import { Network, ArrowRight } from "lucide-react";
import { TOPIC_TYPE_LABELS, TOPIC_STATUS_LABELS, TOPIC_STATUS_TONES } from "@/lib/labels";
import { StatusBadge } from "@/components/shared/status-badge";

export const dynamic = "force-dynamic";

/**
 * Topic 关系图谱（规格 §66）：血缘可视化（parent/source/derived/related）。
 */
export default async function TopicGraphPage() {
  const topics = await topicRepository.list();

  // 收集所有关系（一次查询所有 topic 的关系）
  const allRelations = await collectAllRelations(topics.map((t) => t.id));
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  // 按关系类型分组
  const byType = {
    parent: allRelations.filter((r) => r.relationType === "parent"),
    source: allRelations.filter((r) => r.relationType === "source"),
    derived: allRelations.filter((r) => r.relationType === "derived"),
    related: allRelations.filter((r) => r.relationType === "related"),
  };

  // 孤儿 Topic（无任何关系）
  const relatedIds = new Set(allRelations.flatMap((r) => [r.sourceTopicId, r.targetTopicId]));
  const orphans = topics.filter((t) => !relatedIds.has(t.id) && !t.parentTopicId);

  const renderEdge = (r: { sourceTopicId: string; targetTopicId: string }, label: string, tone: string) => {
    const s = topicMap.get(r.sourceTopicId);
    const t = topicMap.get(r.targetTopicId);
    if (!s || !t) return null;
    return (
      <div key={`${r.sourceTopicId}-${r.targetTopicId}`} className="flex items-center gap-2 py-1 text-xs">
        <Link href={`/topics/${s.id}`} className="max-w-[220px] truncate font-medium text-zinc-700 hover:text-blue-600">{s.title}</Link>
        <Badge variant={tone as never}>{label}</Badge>
        <ArrowRight className="h-3 w-3 text-zinc-300" />
        <Link href={`/topics/${t.id}`} className="max-w-[220px] truncate font-medium text-zinc-700 hover:text-blue-600">{t.title}</Link>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold"><Network className="h-4 w-4 text-blue-600" />Topic 关系图谱</h1>
        <p className="text-xs text-zinc-500">血缘关系（规格 §7）：一个 Topic 由多个来源演变，支持 parent/source/derived/related 多类型。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>父子关系（parent / derived）</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {[...byType.parent, ...byType.derived].map((r) => renderEdge(r, r.relationType === "parent" ? "父" : "衍生", "blue"))}
            {!byType.parent.length && !byType.derived.length && <p className="text-xs text-zinc-400">暂无父子关系</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>多来源（source）</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {byType.source.map((r) => renderEdge(r, "来源", "green"))}
            {!byType.source.length && <p className="text-xs text-zinc-400">暂无来源关系</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>相关（related）</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {byType.related.map((r) => renderEdge(r, "相关", "orange"))}
            {!byType.related.length && <p className="text-xs text-zinc-400">暂无相关关系</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>全部 Topic（{topics.length}）</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {topics.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-1 text-xs">
                <PriorityBadge priority={t.priority} />
                <Link href={`/topics/${t.id}`} className="max-w-[200px] truncate font-medium text-zinc-700 hover:text-blue-600">{t.title}</Link>
                <Badge variant="outline">{TOPIC_TYPE_LABELS[t.topicType] ?? t.topicType}</Badge>
                <StatusBadge label={TOPIC_STATUS_LABELS[t.status] ?? t.status} tone={TOPIC_STATUS_TONES[t.status] as never} />
                {orphans.includes(t) && <Badge variant="orange">孤立</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function collectAllRelations(topicIds: string[]) {
  const { topicRepository } = await import("@/lib/repositories");
  const all: Awaited<ReturnType<typeof topicRepository.listRelations>> = [];
  for (const id of topicIds) {
    const rels = await topicRepository.listRelations(id);
    all.push(...rels);
  }
  // 去重
  const seen = new Set<string>();
  return all.filter((r) => {
    const key = `${r.sourceTopicId}-${r.targetTopicId}-${r.relationType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
