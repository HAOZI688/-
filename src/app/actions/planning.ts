"use server";

import { revalidatePath } from "next/cache";
import { orchestratorService } from "@/lib/services/orchestrator";

/** 生成本周内容计划（Orchestrator：扫描 → 评分 → 路由 → 落库 draft） */
export async function generatePlanAction(weekPrefix: string) {
  await orchestratorService.generateWeeklyPlan(weekPrefix);
  revalidatePath("/planning");
  revalidatePath("/review");
  revalidatePath("/dashboard");
}
