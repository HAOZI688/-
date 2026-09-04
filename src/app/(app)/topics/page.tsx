import { TopicsTable } from "@/components/topics/topics-table";
import { listTopics } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const topics = await listTopics();
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Topic 中心</h1>
        <p className="text-xs text-zinc-500">
          Topic 是系统核心实体：一个 Topic 可衍生多种内容资产；血缘通过 Parent / Source Topics 表达。
        </p>
      </div>
      <TopicsTable topics={topics} />
    </div>
  );
}
