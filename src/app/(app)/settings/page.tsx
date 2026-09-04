import { listWorkflowTemplates, listWorkflowRuns, listTopics } from "@/lib/repo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WORKFLOW_TYPE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [templates, runs, topics] = await Promise.all([listWorkflowTemplates(), listWorkflowRuns(), listTopics()]);

  const envKeys = ["DATABASE_URL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "FIRE_AI_API_KEY"];
  const present: Record<string, boolean> = {};
  for (const k of envKeys) present[k] = Boolean(process.env[k]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">设置</h1>
        <p className="text-xs text-zinc-500">系统配置与运行状态。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>运行状态</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-zinc-500">环境</span><Badge variant="blue">本地开发</Badge></div>
            <div className="flex justify-between"><span className="text-zinc-500">Topic 总数</span><span className="tabular">{topics.length}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Workflow 模板</span><span className="tabular">{templates.length}（{WORKFLOW_TYPE_LABELS[templates[0]?.workflowType ?? "orchestrator"]} 等）</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">执行记录</span><span className="tabular">{runs.length}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>AI 配置</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {envKeys.map((k) => (
              <div key={k} className="flex justify-between">
                <span className="font-mono">{k}</span>
                {present[k] ? <Badge variant="green">已配置</Badge> : <Badge variant="outline">未配置</Badge>}
              </div>
            ))}
            <p className="pt-2 text-[10px] leading-relaxed text-zinc-400">
              Prompt 不内嵌在组件：全部位于 <code className="rounded bg-zinc-100 px-1">ai-prompts/</code>，由 Orchestrator 加载后分发给子工作流。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
