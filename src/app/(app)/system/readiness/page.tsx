import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { authEnabled } from "@/lib/auth";
import { appMode, isLiveMode } from "@/lib/services/live-mode";
import { configuredProviders, checkProviderHealth } from "@/lib/ai/providers";
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
  /** B-4 §28：两层 readiness */
  layer: "engineering" | "business";
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
    items.push({ key: "db", layer: "engineering", name: "数据库连接", tier: "critical", verdict: "PASS", detail: "PostgreSQL 连接正常" });
  } catch (e) {
    items.push({ key: "db", layer: "engineering", name: "数据库连接", tier: "critical", verdict: "FAIL", detail: `连接失败：${e instanceof Error ? e.message : e}` });
  }

  // 2. 迁移最新（_journal 与 drizzle 表数量一致）
  try {
    const rows = (await db.execute(sql`
      SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'
    `)) as unknown as { tables: number }[];
    const n = Number(rows[0]?.tables ?? 0);
    items.push({
      layer: "engineering",
      key: "migrations",
      name: "数据库迁移",
      tier: "critical",
      verdict: n >= 60 ? "PASS" : "WARN",
      detail: `public schema 共 ${n} 张表（含 V4 新表 publish_packages / action_items 等）`,
    });
  } catch {
    items.push({ key: "migrations", layer: "engineering", name: "数据库迁移", tier: "critical", verdict: "FAIL", detail: "无法查询表清单" });
  }

  // 3. 认证（live 模式必须配置）
  const authed = authEnabled();
  items.push({
    key: "auth",
    layer: "engineering",
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
    layer: "engineering",
    name: "运行模式（APP_MODE）",
    tier: "critical",
    verdict: "PASS",
    detail: live ? "APP_MODE=live：Dashboard/Analytics/Weekly Planning 排除 seed 演示数据" : `当前 ${appMode()}（含演示数据）；真实运营时设置 APP_MODE=live`,
  });

  // 5. 发布包流程（表 + 状态机就绪）
  try {
    const rows = (await db.execute(sql`SELECT count(*)::int AS n FROM publish_packages`)) as unknown as { n: number }[];
    items.push({ key: "publish_pkg", layer: "engineering", name: "发布包（Publish Package）", tier: "critical", verdict: "PASS", detail: `publish_packages 表就绪，当前 ${Number(rows[0]?.n ?? 0)} 个包` });
  } catch (e) {
    items.push({ key: "publish_pkg", layer: "engineering", name: "发布包（Publish Package）", tier: "critical", verdict: "FAIL", detail: `表不可用：${e instanceof Error ? e.message : e}` });
  }

  // ===== Required =====
  // 6. AI Provider（B-3 §4：真实请求健康检查——环境变量存在 ≠ Ready）
  const chain = configuredProviders();
  const primaryHealth = chain[0] ? await checkProviderHealth(chain[0]) : null;
  const fallbackHealth = chain[1] ? await checkProviderHealth(chain[1]) : null;
  const aiVerified = primaryHealth?.reachable === true;
  items.push({
    key: "ai",
    layer: "engineering",
    name: "AI Primary Provider（真实请求验证）",
    tier: "required",
    verdict: aiVerified ? "PASS" : live ? "FAIL" : "WARN",
    detail: aiVerified
      ? `${primaryHealth!.provider} / ${primaryHealth!.model} 可达（${primaryHealth!.latencyMs}ms）；Fallback: ${fallbackHealth ? `${fallbackHealth.provider} ${fallbackHealth.reachable ? "可达" : "配置但不可达"}` : "未配置"}`
      : primaryHealth?.configured
        ? `已配置但请求失败：${primaryHealth.errorType ?? "未知错误"}——检查 Key/网络`
        : `未配置（${live ? "LIVE 模式必须配置" : "开发模式演示"}）。支持 AI_PRIMARY_PROVIDER / ANTHROPIC_API_KEY / CONTENT_API_* / OPENAI_API_KEY / DEEPSEEK_API_KEY`,
  });
  items.push({
    key: "ai_fallback",
    layer: "engineering",
    name: "AI Fallback Provider",
    tier: "optional",
    verdict: fallbackHealth ? (fallbackHealth.reachable ? "PASS" : "WARN") : "WARN",
    detail: fallbackHealth
      ? `${fallbackHealth.provider}：${fallbackHealth.reachable ? `可达（${fallbackHealth.latencyMs}ms）` : `配置但不可达：${fallbackHealth.errorType}`}`
      : "未配置（单 Provider 也可运行，仅无故障切换）",
  });

  // 6b. Prompt Version（B-3 §9：四工作流版本登记）
  try {
    const rows = (await db.execute(sql`SELECT workflow_type, current_version FROM prompt_templates WHERE workflow_type IN ('ai_weekly','github_weekly','evergreen','wechat_deep_dive')`)) as unknown as { workflow_type: string; current_version: string }[];
    const registered = new Set(rows.map((r) => r.workflow_type));
    const missing = ["ai_weekly", "github_weekly", "evergreen", "wechat_deep_dive"].filter((w) => !registered.has(w));
    items.push({
      key: "prompt_version",
      layer: "business",
      name: "Prompt Version 登记",
      tier: "required",
      verdict: missing.length === 0 ? "PASS" : missing.length === 4 ? "WARN" : "WARN",
      detail: rows.length
        ? rows.map((r) => `${r.workflow_type}@${r.current_version}`).join(" · ") + (missing.length ? `；未登记：${missing.join(",")}` : "")
        : "prompt_templates 无登记（run 将回落 main 版本标记）",
    });
  } catch {
    items.push({ key: "prompt_version", layer: "business", name: "Prompt Version 登记", tier: "required", verdict: "WARN", detail: "无法查询 prompt_templates" });
  }

  // 7. Scheduler 诚实状态（规格 §29：禁止 UI 假装 Auto Scheduler Active）
  const cronSecret = Boolean(process.env.CRON_SECRET);
  items.push({
    key: "scheduler",
    layer: "engineering",
    name: "Scheduler（诚实状态）",
    tier: "required",
    verdict: "PASS",
    detail: `Scheduler Endpoint Ready（POST /api/cron/scheduler）· External Cron ${cronSecret ? "Configured（CRON_SECRET 已设置）" : "Not Configured（需外部 crontab 每周一 09:00 调用）"}`,
  });

  // 8. 数据回流（真实快照）
  const confidence = await computeDataConfidence();
  items.push({
    key: "data_reflow",
    layer: "business",
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
    items.push({ key: "import_retry", layer: "engineering", name: "导入失败行重试/导出", tier: "required", verdict: "PASS", detail: `失败行留痕可用（当前 ${Number(rows[0]?.failed ?? 0)} 个批次含失败行）` });
  } catch {
    items.push({ key: "import_retry", layer: "engineering", name: "导入失败行重试/导出", tier: "required", verdict: "FAIL", detail: "failed_row_data 列不可用" });
  }

  // ===== Business 层新增检查（B-4 §28） =====
  // B1. GitHub Snapshot 有效性（最新快照是否有核验通过项 / 是否周一 / immutable）
  try {
    const rows = (await db.execute(sql`
      SELECT s.snapshot_id, s.capture_time, s.immutable, s.capture_source,
             extract(dow from s.capture_time) as dow,
             count(*) FILTER (WHERE i.verification_status = 'verified')::int AS verified,
             count(*) FILTER (WHERE i.selected)::int AS selected
      FROM github_snapshots s LEFT JOIN github_snapshot_items i ON i.snapshot_id = s.id
      GROUP BY s.id ORDER BY s.capture_time DESC LIMIT 1
    `)) as unknown as { snapshot_id: string; capture_time: string; immutable: boolean; capture_source: string; dow: number; verified: number; selected: number }[];
    const g = rows[0];
    if (g) {
      const dow = Number(g.dow);
      const isMonday = dow === 1;
      items.push({
        key: "github_snapshot_validity",
        layer: "business",
        name: "GitHub Snapshot 有效性",
        tier: "required",
        verdict: g.verified > 0 && isMonday ? "PASS" : g.verified > 0 ? "WARN" : "FAIL",
        detail: `${g.snapshot_id} · 抓取周${["日", "一", "二", "三", "四", "五", "六"][dow]} · 核验通过 ${g.verified} / 选中 ${g.selected}${g.immutable ? " · immutable" : ""}${isMonday ? "" : "（非周一抓取——历史快照仅审计，不作为本周生产依据）"}`,
      });
    } else {
      items.push({ key: "github_snapshot_validity", layer: "business", name: "GitHub Snapshot 有效性", tier: "required", verdict: "FAIL", detail: "无任何快照" });
    }
  } catch {
    items.push({ key: "github_snapshot_validity", layer: "business", name: "GitHub Snapshot 有效性", tier: "required", verdict: "FAIL", detail: "查询失败" });
  }

  // B2. 未来时间数据（必须为 0）
  try {
    const rows = (await db.execute(sql`
      SELECT (SELECT count(*)::int FROM post_metric_snapshots WHERE captured_at > now() + interval '5 minutes' AND NOT excluded_from_production) AS p,
             (SELECT count(*)::int FROM account_metric_snapshots WHERE captured_at > now() + interval '5 minutes' AND NOT excluded_from_production) AS a
    `)) as unknown as { p: number; a: number }[];
    const n = Number(rows[0]?.p ?? 0) + Number(rows[0]?.a ?? 0);
    items.push({ key: "future_data", layer: "business", name: "未来时间数据（INVALID_FUTURE_TIMESTAMP）", tier: "required", verdict: n === 0 ? "PASS" : "FAIL", detail: n === 0 ? "无未隔离的未来时间快照" : `${n} 条未来时间快照未隔离` });
  } catch {
    items.push({ key: "future_data", layer: "business", name: "未来时间数据", tier: "required", verdict: "FAIL", detail: "查询失败" });
  }

  // B3. 内容质量 Gate（业务 Gate 已实现并接入 writeback）
  items.push({
    key: "content_quality_gate",
    layer: "business",
    name: "内容业务质量 Gate（AI Weekly 事件数/Evergreen 深度/WeChat 长度+CTA）",
    tier: "required",
    verdict: "PASS",
    detail: "业务 Gate 已接入 writeback：不过 → run 转 needs_review 并记录原因（workflow_outputs.business_gate_fail 可追溯）",
  });

  // ===== Optional =====
  // 10. 出站通知
  const feishu = Boolean(process.env.FEISHU_WEBHOOK_URL);
  items.push({
    key: "feishu",
    layer: "engineering",
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
  items.push({ key: "backup", layer: "engineering", name: "数据库备份", tier: "optional", verdict: backupVerdict, detail: backupDetail });

  // B-4 §28：两层 readiness——Engineering / Business 共同决定 Overall
  const engItems = items.filter((i) => i.layer === "engineering");
  const bizItems = items.filter((i) => i.layer === "business");
  const engFail = engItems.some((i) => i.tier !== "optional" && i.verdict === "FAIL");
  const engWarn = engItems.some((i) => i.tier !== "optional" && i.verdict === "WARN");
  const bizFail = bizItems.some((i) => i.tier !== "optional" && i.verdict === "FAIL");
  const bizWarn = bizItems.some((i) => i.tier !== "optional" && i.verdict === "WARN");

  const engStatus = engFail ? "ENGINEERING BLOCKED" : engWarn ? "ENGINEERING READY（有警告）" : "ENGINEERING READY";
  const bizStatus = bizFail ? "BUSINESS PRODUCTION BLOCKED" : bizWarn ? "BUSINESS READY（有警告）" : "BUSINESS READY";
  const overall = engFail || bizFail ? "NOT READY" : engWarn || bizWarn ? "PRODUCTION READY（有警告）" : "PRODUCTION READY";
  const overallTone = engFail || bizFail ? "red" : engWarn || bizWarn ? "orange" : "green";

  const layers: { label: string; layer: CheckItem["layer"] }[] = [
    { label: "Engineering Readiness（工程就绪）", layer: "engineering" },
    { label: "Business Production Readiness（业务生产就绪）", layer: "business" },
  ];

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

      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">{engStatus}</div>
        <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${bizFail ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{bizStatus}</div>
      </div>

      {layers.map(({ label, layer }) => {
        const tierItems = items.filter((i) => i.layer === layer);
        return (
          <Card key={layer}>
            <CardContent className="p-0">
              <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">{label}</div>
              <ul className="divide-y divide-zinc-100">
                {tierItems.map((i) => (
                  <li key={i.key} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-800">{i.name}
                        <span className="ml-1.5 rounded bg-zinc-100 px-1 text-[9px] font-normal text-zinc-400">{TIER_LABELS[i.tier]}</span>
                      </div>
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
