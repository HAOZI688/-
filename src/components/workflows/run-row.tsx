"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { getRunTasksAction } from "@/app/actions/workflows";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES, WORKFLOW_TYPE_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import type { WorkflowRun, WorkflowTask } from "@/lib/db/schema";

interface Row {
  run: WorkflowRun;
  topic: { id: string; title: string; topicId: string } | null;
}

export function RunRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<WorkflowTask[] | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!tasks) {
      startTransition(async () => {
        setTasks(await getRunTasksAction(row.run.id));
      });
    }
  }

  const r = row.run;
  return (
    <div className="border-b border-zinc-100">
      <button onClick={toggle} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-zinc-50">
        <div className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
          <span className="text-sm font-medium">{WORKFLOW_TYPE_LABELS[r.workflowType]}</span>
          {r.batchId && <span className="font-mono text-[10px] text-zinc-400">{r.batchId}</span>}
          {row.topic && (
            <a href={`/topics/${row.topic.id}`} className="truncate text-xs text-blue-600 hover:underline">
              {row.topic.title}
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <span className="tabular text-zinc-400">{fmtDate(r.createdAt)}</span>
          <StatusBadge label={RUN_STATUS_LABELS[r.status]} tone={RUN_STATUS_TONES[r.status]} />
        </div>
      </button>

      {open && (
        <div className="bg-zinc-50/60 px-6 pb-3 pt-1 text-xs">
          {pending && !tasks && <p className="py-2 text-zinc-400">加载任务…</p>}
          {tasks && tasks.length === 0 && <p className="py-2 text-zinc-400">该 Run 暂无子任务。</p>}
          {tasks?.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-zinc-100 py-1.5 last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-zinc-400">{t.taskKey}</span>
                <span className="text-zinc-700">{t.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {t.error && <span className="text-red-500">{t.error}</span>}
                <StatusBadge label={RUN_STATUS_LABELS[t.status]} tone={RUN_STATUS_TONES[t.status]} />
              </div>
            </div>
          ))}
          {r.error && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-red-600">错误：{r.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
