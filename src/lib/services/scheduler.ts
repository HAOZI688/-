import { orchestratorService } from "@/lib/services/orchestrator";
import { previousCompleteWeek } from "@/lib/utils";
import { auditRepository } from "@/lib/repositories";

/**
 * Weekly Scheduler（V2 P1）：每周一自动触发「上一自然周」任务。
 *
 * 设计：不代替人工做任何决策，只在周一时点把上一自然周的运营流推到正确位置：
 * - 无计划 → 自动扫描生成本周计划（draft，等用户确认选题 —— Human Gate 1）
 * - 已确认（confirmed）→ 自动开始生产（DAG 根节点；下游由 engine 自动推进）
 * - draft / production / completed → 保持不动（幂等，可任意重跑）
 *
 * 调用方：POST /api/cron/scheduler（外部 cron：每周一 09:00 打一次）。
 * 本地无 cron 时：点击 Dashboard 顶部「运行调度」按钮或直接 curl 该接口。
 */
export const weeklyScheduler = {
  /** 返回 { weekKey, plan, created, startedCount, skipped } 摘要；不抛错（cron 可安全重跑） */
  async runNow() {
    const week = previousCompleteWeek();
    const summary: { weekKey: string; planId?: string; created: boolean; startedCount: number; skipped: string } = {
      weekKey: week.weekKey,
      created: false,
      startedCount: 0,
      skipped: "",
    };

    let plan = await orchestratorServicePlanOrNull(week.weekKey);
    if (!plan) {
      try {
        const generated = await orchestratorService.generateWeeklyPlan(week.weekKey);
        plan = generated.plan;
        summary.created = true;
        summary.planId = plan.id;
        summary.skipped = "自动生成 draft 计划，等用户确认选题";
      } catch (e) {
        summary.skipped = `生成计划失败：${e instanceof Error ? e.message : String(e)}`;
        await logSchedulerRun(summary);
        return summary;
      }
    }

    summary.planId = plan.id;
    if (plan.status === "confirmed") {
      try {
        const result = await orchestratorService.startProduction(plan.id);
        summary.startedCount = result.started.length;
        summary.skipped = "";
      } catch (e) {
        summary.skipped = `开始生产失败：${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      summary.skipped = `计划状态 ${plan.status}（无需调度动作）`;
    }

    await logSchedulerRun(summary);
    return summary;
  },
};

/** 审计留痕：每次调度运行落一条记录 */
async function logSchedulerRun(summary: { weekKey: string; created: boolean; startedCount: number; skipped: string }) {
  try {
    await auditRepository.log({
      action: "system",
      entityType: "weekly_plan",
      entityId: summary.weekKey,
      before: null,
      after: { created: summary.created, startedCount: summary.startedCount },
      notes: `Scheduler 运行 ${summary.weekKey}：created=${summary.created} started=${summary.startedCount}（${summary.skipped || "正常"}）`,
      actor: "ai:scheduler",
    });
  } catch {
    // 审计失败不阻断调度
  }
}

/** 查计划（不因不存在抛错） */
async function orchestratorServicePlanOrNull(weekPrefix: string) {
  const { orchestratorRepository } = await import("@/lib/repositories");
  return orchestratorRepository.getPlan(weekPrefix);
}
