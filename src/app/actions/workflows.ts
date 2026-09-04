"use server";

import { getRunTasks, getRunsByTopic } from "@/lib/repo";
import { revalidatePath } from "next/cache";
import { startWorkflowRun, retryWorkflowRun, type WorkflowType } from "@/lib/workflows/engine";

export async function getRunTasksAction(runId: string) {
  return getRunTasks(runId);
}

export async function refreshRuns() {
  revalidatePath("/workflows/runs");
  revalidatePath("/workflows");
  return true;
}

export async function triggerWorkflowAction(input: { workflowType: WorkflowType; topicId?: string; forceDemo?: boolean }) {
  const run = await startWorkflowRun({
    workflowType: input.workflowType,
    topicId: input.topicId,
    batchId: input.topicId ? undefined : `${new Date().toISOString().slice(0, 10)}-${input.workflowType}`,
    inputPayload: { triggeredBy: "manual", at: new Date().toISOString() },
    forceDemo: input.forceDemo,
  });
  revalidatePath("/workflows/runs");
  revalidatePath("/workflows");
  return run.id;
}

/** V4：失败/需人工介入的 run 幂等重试（复用原 run，不重复创建 writeback 产物） */
export async function retryWorkflowRunAction(runId: string) {
  const run = await retryWorkflowRun(runId);
  revalidatePath("/production");
  revalidatePath("/workflows/runs");
  revalidatePath("/dashboard");
  return { ok: Boolean(run), runId };
}
