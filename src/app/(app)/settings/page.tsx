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

      {/* V4 数据导出（规格 §31）+ 调度器诚实状态 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>数据导出（CSV）</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <a href="/api/export?type=topics" className="rounded-md border border-zinc-200 px-2 py-1.5 text-center hover:bg-zinc-50">Topics</a>
              <a href="/api/export?type=publications" className="rounded-md border border-zinc-200 px-2 py-1.5 text-center hover:bg-zinc-50">Publications</a>
              <a href="/api/export?type=topic_performance" className="rounded-md border border-zinc-200 px-2 py-1.5 text-center hover:bg-zinc-50">Topic Performance</a>
              <a href="/api/export?type=social_metrics" className="rounded-md border border-zinc-200 px-2 py-1.5 text-center hover:bg-zinc-50">Social Metrics</a>
            </div>
            <p className="text-[10px] text-zinc-400">CSV（UTF-8 BOM，Excel 可直接打开）。配置登录凭证后由系统统一鉴权。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>调度器（诚实状态）</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">调度端点</span>
              <Badge variant="green">Ready（POST /api/cron/scheduler）</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">外部 Cron</span>
              <Badge variant="outline">Not Configured（需自行配置 crontab）</Badge>
            </div>
            <p className="pt-1 text-[10px] leading-relaxed text-zinc-400">
              系统不内置常驻调度进程。每周任务需外部触发（crontab 示例见 API 路由注释）：
              <code className="ml-1 rounded bg-zinc-100 px-1">0 9 * * 1 curl -s -X POST http://localhost:3210/api/cron/scheduler</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
