import { NextResponse } from "next/server";
import { weeklyScheduler } from "@/lib/services/scheduler";
import { revalidatePath } from "next/cache";

/**
 * 周一调度触发点（V2 P1）：每周一 09:00 由外部 cron 调用，触发「上一自然周」任务。
 *
 *   crontab 示例（macOS / Linux）：
 *   0 9 * * 1 curl -s -X POST http://localhost:3000/api/cron/scheduler
 *
 * 幂等：同一周可重复调用（无计划才生成；confirmed 才开始生产；production/completed 直接跳过）。
 */
export async function POST() {
  const summary = await weeklyScheduler.runNow();
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  revalidatePath("/weekly-plan");
  revalidatePath("/production");
  revalidatePath("/review");
  return NextResponse.json({ ok: true, ...summary });
}

/** 浏览器直接访问（GET）也能触发，便于本地测试 */
export async function GET() {
  const summary = await weeklyScheduler.runNow();
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  revalidatePath("/weekly-plan");
  revalidatePath("/production");
  revalidatePath("/review");
  return NextResponse.json({ ok: true, ...summary });
}
