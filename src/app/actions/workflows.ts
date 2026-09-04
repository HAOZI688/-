"use server";

import { getRunTasks, getRunsByTopic } from "@/lib/repo";
import { revalidatePath } from "next/cache";
import { startWorkflowRun, type WorkflowType } from "@/lib/workflows/engine";

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
