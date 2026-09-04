import Link from "next/link";
import { notFound } from "next/navigation";
import { getTopicById, getRunsByTopic } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { RunRow } from "@/components/workflows/run-row";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Topic 关联工作流执行记录：一个 Topic 的全部 workflow runs。
 */
export default async function TopicRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = await getTopicById(id);
  if (!topic) notFound();
  const runs = await getRunsByTopic(topic.id);

  const row = { topic: { id: topic.id, title: topic.title, topicId: topic.topicId } };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">执行记录</h1>
          <p className="text-xs text-zinc-500">Topic：{topic.title}</p>
        </div>
        <Link href={`/topics/${topic.id}`}><Button variant="outline" size="sm">返回 Topic</Button></Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">该 Topic 暂无工作流执行记录。</p>
          ) : (
            runs.map((run) => <RunRow key={run.id} row={{ run, ...row }} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
