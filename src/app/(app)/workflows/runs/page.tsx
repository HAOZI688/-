import { listWorkflowRunsWithTopic } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { RunRow } from "@/components/workflows/run-row";

export const dynamic = "force-dynamic";

export default async function WorkflowRunsPage() {
  const rows = await listWorkflowRunsWithTopic();

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">执行记录</h1>
        <p className="text-xs text-zinc-500">
          所有 workflow run 均持久化：状态、输入输出、错误、耗时，随时可追溯（点击展开子任务）。
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">暂无执行记录。工作流触发后这里会出现完整轨迹。</p>
          ) : (
            rows.map((row) => <RunRow key={row.run.id} row={row} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
