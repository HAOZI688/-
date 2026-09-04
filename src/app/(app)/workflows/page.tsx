import Link from "next/link";
import { listWorkflowTemplates, listWorkflowRuns } from "@/lib/repo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { WORKFLOW_TYPE_LABELS, RUN_STATUS_LABELS, RUN_STATUS_TONES } from "@/lib/labels";
import { WorkflowTrigger } from "@/components/workflows/workflow-trigger";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const [templates, recentRuns] = await Promise.all([listWorkflowTemplates(), listWorkflowRuns(8)]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">工作流</h1>
        <p className="text-xs text-zinc-500">
          Orchestrator + 4 个子工作流。Prompt 统一存放在 <code className="rounded bg-zinc-100 px-1">ai-prompts/</code> 目录，页面不内嵌提示词。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t.name}</CardTitle>
                {t.active ? <Badge variant="green">启用</Badge> : <Badge variant="outline">停用</Badge>}
              </div>
              <div className="text-[10px] font-mono text-zinc-400">{t.workflowType} · v{t.version}</div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p className="text-zinc-500">{t.description ?? "—"}</p>
              <div className="rounded bg-zinc-50 px-2 py-1 font-mono text-[10px] text-zinc-500">
                {t.promptFile ?? "未关联 prompt 文件"}
              </div>
              <div className="flex items-center justify-between pt-1">
                <WorkflowTrigger workflowType={t.workflowType} name={t.name} />
                <Link href="/workflows/runs">
                  <Button variant="outline" size="sm">执行记录</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">最近执行</CardTitle>
            <Link href="/workflows/runs" className="text-xs text-blue-600 hover:underline">全部 →</Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-xs text-zinc-400">暂无执行记录。</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentRuns.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <span className="font-medium">{WORKFLOW_TYPE_LABELS[r.workflowType]}</span>
                    {r.batchId && <span className="ml-1.5 font-mono text-[10px] text-zinc-400">{r.batchId}</span>}
                    <div className="text-[10px] text-zinc-400">{fmtDate(r.createdAt)}</div>
                  </div>
                  <StatusBadge label={RUN_STATUS_LABELS[r.status]} tone={RUN_STATUS_TONES[r.status]} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
