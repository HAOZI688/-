import { NextResponse } from "next/server";
import { weeklyScheduler } from "@/lib/services/scheduler";
import { revalidatePath } from "next/cache";

/**
 * 周一调度触发点（V2 P1）：每周一 09:00 由外部 cron 调用，触发「上一自然周」任务。
 *
 *   crontab 示例（macOS / Linux）：
 *   0 9 * * 1 curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3210/api/cron/scheduler
 *
 * V4：配置 CRON_SECRET 后强制校验（header x-cron-secret 或 ?secret=）；未配置时允许本地调用（readiness 页标记）。
 * 幂等：同一周可重复调用（无计划才生成；confirmed 才开始生产；production/completed 直接跳过）。
 */
function checkSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 未配置：本地开发放行
  const header = request.headers.get("x-cron-secret");
  const url = new URL(request.url);
  return header === secret || url.searchParams.get("secret") === secret;
}

export async function POST(request: Request) {
  if (!checkSecret(request)) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN: CRON_SECRET 校验失败" }, { status: 403 });
  }
  const summary = await weeklyScheduler.runNow();
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  revalidatePath("/weekly-plan");
  revalidatePath("/production");
  revalidatePath("/review");
  return NextResponse.json({ ok: true, ...summary });
}

/** 浏览器直接访问（GET）也能触发，便于本地测试 */
export async function GET(request: Request) {
  if (!checkSecret(request)) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN: CRON_SECRET 校验失败" }, { status: 403 });
  }
  const summary = await weeklyScheduler.runNow();
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  revalidatePath("/weekly-plan");
  revalidatePath("/production");
  revalidatePath("/review");
  return NextResponse.json({ ok: true, ...summary });
}
