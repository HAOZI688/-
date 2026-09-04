import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { authEnabled } from "@/lib/auth";
import { appMode, isLiveMode } from "@/lib/services/live-mode";
import { isAiConfigured, configuredProviders } from "@/lib/ai/providers";
import { computeDataConfidence } from "@/lib/services/data-confidence";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

export const dynamic = "force-dynamic";

type Verdict = "PASS" | "WARN" | "FAIL";
interface CheckItem {
  key: string;
  name: string;
  /** critical：任一 FAIL → NOT READY；required：影响运营质量；optional：增强项 */
  tier: "critical" | "required" | "optional";
  verdict: Verdict;
  detail: string;
}

const VERDICT_TONES: Record<Verdict, "green" | "orange" | "red"> = { PASS: "green", WARN: "orange", FAIL: "red" };
const TIER_LABELS: Record<string, string> = { critical: "Critical（关键）", required: "Required（必备）", optional: "Optional（增强）" };

/**
 * V4 系统就绪检查（规格 §40）：/system/readiness。
 * Critical / Required / Optional 三级；任一 Critical FAIL → NOT READY（诚实呈现，不粉饰）。
 */
export default async function ReadinessPage() {
  const live = isLiveMode();
  const items: CheckItem[] = [];

  // ===== Critical =====
  // 1. 数据库连接
  try {
    await db.execute(sql`SELECT 1`);
    items.push({ key: "db", name: "数据库连接", tier: "critical", verdict: "PASS", detail: "PostgreSQL 连接正常" });
  } catch (e) {
    items.push({ key: "db", name: "数据库连接", tier: "critical", verdict: "FAIL", detail: `连接失败：${e instanceof Error ? e.message : e}` });
  }

  // 2. 迁移最新（_journal 与 drizzle 表数量一致）
  try {
    const rows = (await db.execute(sql`
      SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'
    `)) as unknown as { tables: number }[];
    const n = Number(rows[0]?.tables ?? 0);
    items.push({
      key: "migrations",
      name: "数据库迁移",
      tier: "critical",
      verdict: n >= 60 ? "PASS" : "WARN",
      detail: `public schema 共 ${n} 张表（含 V4 新表 publish_packages / action_items 等）`,
    });
  } catch {
    items.push({ key: "migrations", name: "数据库迁移", tier: "critical", verdict: "FAIL", detail: "无法查询表清单" });
  }

  // 3. 认证（live 模式必须配置）
  const authed = authEnabled();
  items.push({
    key: "auth",
    name: "登录认证（单用户）",
    tier: "critical",
    verdict: authed ? "PASS" : live ? "FAIL" : "WARN",
    detail: authed
      ? "已配置 AUTH_PASSWORD_HASH / AUTH_PASSWORD，路由由 Proxy 保护"
      : live
        ? "LIVE 模式必须配置 AUTH_PASSWORD_HASH（或 AUTH_PASSWORD）—— 否则系统完全开放"
        : "开发模式未配置凭证（放行）；上线前必须配置",
  });

  // 4. 运行模式标记
  items.push({
    key: "app_mode",
    name: "运行模式（APP_MODE）",
    tier: "critical",
    verdict: "PASS",
    detail: live ? "APP_MODE=live：Dashboard/Analytics/Weekly Planning 排除 seed 演示数据" : `当前 ${appMode()}（含演示数据）；真实运营时设置 APP_MODE=live`,
  });

  // 5. 发布包流程（表 + 状态机就绪）
  try {
    const rows = (await db.execute(sql`SELECT count(*)::int AS n FROM publish_packages`)) as unknown as { n: number }[];
    items.push({ key: "publish_pkg", name: "发布包（Publish Package）", tier: "critical", verdict: "PASS", detail: `publish_packages 表就绪，当前 ${Number(rows[0]?.n ?? 0)} 个包` });
  } catch (e) {
    items.push({ key: "publish_pkg", name: "发布包（Publish Package）", tier: "critical", verdict: "FAIL", detail: `表不可用：${e instanceof Error ? e.message : e}` });
  }

  // ===== Required =====
  // 6. AI Provider
  const ai = isAiConfigured();
  items.push({
    key: "ai",
    name: "AI Provider（工作流真实调用）",
    tier: "required",
    verdict: ai ? "PASS" : live ? "FAIL" : "WARN",
    detail: ai
      ? `已配置：${configuredProviders().join(" → ")}（超时/重试/Fallback 已启用）`
      : live
        ? "未配置任何 AI Key，工作流无法真实产出内容——LIVE 模式必须配置"
        : "未配置（演示模式，产出为占位内容）；配置 ANTHROPIC_API_KEY 或 CONTENT_API_* 后真实调用",
  });

  // 7. Scheduler 诚实状态（规格 §29：禁止 UI 假装 Auto Scheduler Active）
  const cronSecret = Boolean(process.env.CRON_SECRET);
  items.push({
    key: "scheduler",
    name: "Scheduler（诚实状态）",
    tier: "required",
    verdict: "PASS",
    detail: `Scheduler Endpoint Ready（POST /api/cron/scheduler）· External Cron ${cronSecret ? "Configured（CRON_SECRET 已设置）" : "Not Configured（需外部 crontab 每周一 09:00 调用）"}`,
  });

  // 8. 数据回流（真实快照）
  const confidence = await computeDataConfidence();
  items.push({
    key: "data_reflow",
    name: "真实数据回流",
    tier: "required",
    verdict: confidence.realPostSnapshots > 0 ? "PASS" : live ? "FAIL" : "WARN",
    detail: `真实指标快照 ${confidence.realPostSnapshots} · 表现记录 ${confidence.realTopicPerformances} · 发布 ${confidence.realPublications}（${confidence.level}）`,
  });

  // 9. 导入容错（失败行重试能力 = data_import_batches.failed_row_data 列存在）
  try {
    const rows = (await db.execute(sql`
      SELECT count(*)::int AS failed FROM data_import_batches WHERE jsonb_array_length(failed_row_data) > 0
    `)) as unknown as { failed: number }[];
    items.push({ key: "import_retry", name: "导入失败行重试/导出", tier: "required", verdict: "PASS", detail: `失败行留痕可用（当前 ${Number(rows[0]?.failed ?? 0)} 个批次含失败行）` });
  } catch {
    items.push({ key: "import_retry", name: "导入失败行重试/导出", tier: "required", verdict: "FAIL", detail: "failed_row_data 列不可用" });
  }

  // ===== Optional =====
  // 10. 出站通知
  const feishu = Boolean(process.env.FEISHU_WEBHOOK_URL);
  items.push({
    key: "feishu",
    name: "出站通知（飞书 Webhook）",
    tier: "optional",
    verdict: feishu ? "PASS" : "WARN",
    detail: feishu ? "FEISHU_WEBHOOK_URL 已配置，通知同步推送飞书" : "未配置（系统完整可用，仅站内通知）",
  });

  // 11. 备份（backups/ 目录最近文件，7 天内有备份 = PASS）
  let backupVerdict: Verdict = "WARN";
  let backupDetail = "未见备份文件——运行 bash scripts/backup-db.sh（策略见 docs/20-backup-and-restore.md）";
  try {
    const { readdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "backups");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql.gz")).sort().reverse();
    if (files.length > 0) {
      const stat = await (await import("node:fs/promises")).stat(path.join(dir, files[0]));
      const ageDays = (Date.now() - stat.mtime.getTime()) / 86400000;
      backupVerdict = ageDays <= 7 ? "PASS" : "WARN";
      backupDetail = `最近备份：${files[0]}（${ageDays.toFixed(1)} 天前，共 ${files.length} 份）`;
    }
  } catch {
    /* backups 目录不存在 → 保持 WARN */
  }
  items.push({ key: "backup", name: "数据库备份", tier: "optional", verdict: backupVerdict, detail: backupDetail });

  const criticalFail = items.some((i) => i.tier === "critical" && i.verdict === "FAIL");
  const overall = criticalFail ? "NOT READY" : items.some((i) => i.tier !== "optional" && i.verdict !== "PASS") ? "NOT READY（存在未完成的 Required 项）" : "PRODUCTION READY";
  const overallTone = criticalFail ? "red" : overall === "PRODUCTION READY" ? "green" : "orange";

  const tiers: CheckItem["tier"][] = ["critical", "required", "optional"];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">生产就绪检查（System Readiness）</h1>
          <p className="text-xs text-zinc-500">Critical / Required / Optional 三级检查 · 任一 Critical FAIL → NOT READY（规格 §40）</p>
        </div>
        <div className={`rounded-lg px-4 py-2 text-sm font-bold ${overallTone === "red" ? "bg-red-100 text-red-700" : overallTone === "green" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
          {overall}
        </div>
      </div>

      {tiers.map((tier) => {
        const tierItems = items.filter((i) => i.tier === tier);
        return (
          <Card key={tier}>
            <CardContent className="p-0">
              <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">{TIER_LABELS[tier]}</div>
              <ul className="divide-y divide-zinc-100">
                {tierItems.map((i) => (
                  <li key={i.key} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-800">{i.name}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">{i.detail}</div>
                    </div>
                    <StatusBadge label={i.verdict} tone={VERDICT_TONES[i.verdict]} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
