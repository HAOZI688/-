"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { triggerWorkflowAction } from "@/app/actions/workflows";

export function WorkflowTrigger({ workflowType, name }: { workflowType: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      try {
        await triggerWorkflowAction({ workflowType: workflowType as never, forceDemo: true });
        setMsg("已触发，查看执行记录");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "触发失败");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[10px] text-blue-600">{msg}</span>}
      <Button size="sm" onClick={run} disabled={pending} variant="secondary">
        {pending ? "触发中…" : "触发运行"}
      </Button>
    </div>
  );
}
