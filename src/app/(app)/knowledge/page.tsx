import Link from "next/link";
import { listKnowledgeWithTopics } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { KNOWLEDGE_CONTENT_STATUS_LABELS, KNOWLEDGE_STATUS_LABELS, VERIFICATION_TONES } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const rows = await listKnowledgeWithTopics();

  const byStatus: Record<string, number> = {};
  rows.forEach(({ k }) => { byStatus[k.knowledgeStatus] = (byStatus[k.knowledgeStatus] ?? 0) + 1; });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">常青知识库</h1>
        <p className="text-xs text-zinc-500">
          AI Knowledge Topic Bank：常青 / 知识类 Topic 的体系化沉淀，跟踪概念覆盖状态与内容生产状态。
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(byStatus).map(([s, n]) => (
          <StatusBadge key={s} label={`${KNOWLEDGE_STATUS_LABELS[s]} ${n}`} tone={VERIFICATION_TONES[s]} />
        ))}
        {rows.length === 0 && <span className="text-zinc-400">暂无知识条目</span>}
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-2">概念</th>
                <th className="px-2 py-2">分类</th>
                <th className="px-2 py-2">知识状态</th>
                <th className="px-2 py-2">内容状态</th>
                <th className="px-2 py-2">B2B / 学习成本 / 长期价值 / 热度</th>
                <th className="px-2 py-2">上游 → 下游</th>
                <th className="px-4 py-2">下一步</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ k, topic }) => (
                <tr key={k.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="max-w-[220px] px-4 py-2">
                    <Link href={`/topics/${topic.id}`} className="font-medium text-zinc-800 hover:text-blue-600">{k.concept}</Link>
                    <div className="text-[10px] text-zinc-400">{topic.topicId}</div>
                  </td>
                  <td className="px-2 py-2 text-zinc-500">{k.category ?? "—"}</td>
                  <td className="px-2 py-2"><StatusBadge label={KNOWLEDGE_STATUS_LABELS[k.knowledgeStatus]} tone={VERIFICATION_TONES[k.knowledgeStatus]} /></td>
                  <td className="px-2 py-2"><StatusBadge label={KNOWLEDGE_CONTENT_STATUS_LABELS[k.contentStatus]} tone="blue" /></td>
                  <td className="px-2 py-2 tabular text-zinc-600">
                    {k.b2bRelevance ?? "—"} / {k.userLearningCost ?? "—"} / {k.longTermValue ?? "—"} / {k.currentHeat ?? "—"}
                  </td>
                  <td className="max-w-[220px] px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {k.upstreamConcepts?.slice(0, 2).map((c) => <Badge key={c} variant="outline">↑{c}</Badge>)}
                      {k.downstreamConcepts?.slice(0, 2).map((c) => <Badge key={c} variant="outline">↓{c}</Badge>)}
                      {!k.upstreamConcepts?.length && !k.downstreamConcepts?.length && <span className="text-zinc-400">—</span>}
                    </div>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2 text-zinc-500">{k.nextAction ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
