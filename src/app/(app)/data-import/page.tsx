"use client";

import { useState } from "react";
import { importXiaodouyaCsv, importManualCsvAction, previewScreenImportAction, executeScreenImportAction } from "@/app/actions/import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle, ClipboardList, MonitorDown } from "lucide-react";

type ManualResult = {
  file: string;
  detectedType: "account" | "post" | "mixed" | "unknown";
  ok: boolean;
  duplicate?: boolean;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  accountsMatched: number;
  postsMatched: number;
  manualMatchRequired: number;
  accountSnapshots: number;
  postSnapshots: number;
  duplicateSnapshots: number;
  errors: { file: string; rowIndex: number; field: string; rawValue: string; reason: string }[];
  triggeredRecalculations?: string[];
  message?: string;
};

type ScreenPreview = {
  exists: boolean;
  message?: string;
  totalRows: number;
  byType: Record<string, number>;
  platforms: string[];
  dateRange: [string, string] | null;
  sample: Record<string, string>[];
  headers: string[];
};

/**
 * 数据导入（规格 §73 + B-1）：小豆芽 CSV 导入 + 人工抄数 CSV 导入（同一 Import Pipeline）。
 */
export default function DataImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string; result?: { totalRows: number; successRows: number; failedRows: number; matchedPublications: number; snapshotsCreated: number } } | null>(null);

  // B-1 抄数
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualImporting, setManualImporting] = useState(false);
  const [manualResult, setManualResult] = useState<ManualResult | null>(null);

  // B-2 /screen 抄数
  const [screenPreview, setScreenPreview] = useState<ScreenPreview | null>(null);
  const [screenResult, setScreenResult] = useState<ManualResult | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);

  async function handleScreenPreview() {
    setScreenBusy(true);
    setScreenResult(null);
    try {
      setScreenPreview(await previewScreenImportAction());
    } finally {
      setScreenBusy(false);
    }
  }

  async function handleScreenImport() {
    setScreenBusy(true);
    try {
      const res = await executeScreenImportAction();
      if (res.result) setScreenResult(res.result);
    } finally {
      setScreenBusy(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await importXiaodouyaCsv(fd);
      setResult(res);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "导入失败" });
    } finally {
      setImporting(false);
    }
  }

  async function handleManualImport() {
    if (!manualFile) return;
    setManualImporting(true);
    setManualResult(null);
    try {
      const res = await importManualCsvAction(manualFile);
      setManualResult(res.result ?? { ok: false, file: manualFile.name, detectedType: "unknown", totalRows: 0, created: 0, updated: 0, skipped: 0, failed: 0, accountsMatched: 0, postsMatched: 0, manualMatchRequired: 0, accountSnapshots: 0, postSnapshots: 0, duplicateSnapshots: 0, errors: [], message: res.error });
    } catch (e) {
      setManualResult({ ok: false, file: manualFile.name, detectedType: "unknown", totalRows: 0, created: 0, updated: 0, skipped: 0, failed: 0, accountsMatched: 0, postsMatched: 0, manualMatchRequired: 0, accountSnapshots: 0, postSnapshots: 0, duplicateSnapshots: 0, errors: [], message: e instanceof Error ? e.message : "导入失败" });
    } finally {
      setManualImporting(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">数据导入</h1>
        <p className="text-xs text-zinc-500">
          两条入口、同一管道：小豆芽导出 CSV（自动化回流）+ 人工抄数 CSV（B-1：日期列 → captured_at，幂等快照）。
        </p>
      </div>

      {/* ===== B-2：/screen 抄数标准入口 ===== */}
      <Card className="border-indigo-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorDown className="h-4 w-4 text-indigo-600" />
            导入 /screen 抄数数据
            <Badge variant="blue">B-2</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-zinc-500">
            在项目目录打开 Claude Code → 小豆芽切到平台数据页 → 执行 <code className="rounded bg-zinc-100 px-1">/screen 抄数</code>（逐平台）→
            数据写入 <code className="rounded bg-zinc-100 px-1">data/metrics-import.csv</code> → 这里一键导入。
            同一数据日期重复导入自动更新，不产生重复快照。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleScreenPreview}
              disabled={screenBusy}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {screenBusy ? "读取中…" : "① 预览 data/metrics-import.csv"}
            </button>
            <button
              onClick={handleScreenImport}
              disabled={screenBusy || !screenPreview?.exists}
              className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              ② 确认导入
            </button>
          </div>

          {screenPreview && !screenPreview.exists && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              📭 尚未发现抄数数据，请先在项目目录执行 <code className="rounded bg-amber-100 px-1">/screen 抄数</code>
              <div className="mt-1 text-[11px] text-amber-600">步骤：项目目录打开 Claude Code → 小豆芽切到平台数据页 → /screen 抄数 → 切下一平台重复 → 回到这里导入</div>
            </div>
          )}

          {screenPreview?.exists && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
              <div className="grid grid-cols-2 gap-1 text-zinc-600 md:grid-cols-4">
                <span>总行数：{screenPreview.totalRows}</span>
                <span>类型：{Object.entries(screenPreview.byType).map(([k, v]) => `${k}×${v}`).join(" / ") || "—"}</span>
                <span>平台：{screenPreview.platforms.join("、") || "—"}</span>
                <span>日期范围：{screenPreview.dateRange ? `${screenPreview.dateRange[0]} ~ ${screenPreview.dateRange[1]}` : "—"}</span>
              </div>
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11px] text-zinc-500">样本（前 5 行）</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2 text-[10px] leading-relaxed text-zinc-600">{JSON.stringify(screenPreview.sample, null, 1)}</pre>
              </details>
            </div>
          )}

          {screenResult && (
            <div className={`rounded-md border p-3 text-xs ${screenResult.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              {screenResult.ok ? (
                <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> /screen 抄数导入完成（{screenResult.detectedType}）
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-medium text-amber-700">
                  <XCircle className="h-3.5 w-3.5" /> 部分完成 / 失败
                </div>
              )}
              {screenResult.message && <div className="mt-1 text-red-600">{screenResult.message}</div>}
              <div className="mt-1.5 grid grid-cols-2 gap-1 text-zinc-600 md:grid-cols-4">
                <span>总行数：{screenResult.totalRows}</span>
                <span>新建：{screenResult.created}</span>
                <span>更新：{screenResult.updated}</span>
                <span>失败：{screenResult.failed}</span>
                <span>账号快照：{screenResult.accountSnapshots}</span>
                <span>作品快照：{screenResult.postSnapshots}</span>
                <span>幂等更新：{screenResult.duplicateSnapshots}</span>
                <span>需人工匹配：{screenResult.manualMatchRequired}</span>
              </div>
              {(screenResult.triggeredRecalculations?.length ?? 0) > 0 && (
                <div className="mt-1.5 text-[11px] text-emerald-700">已自动触发：{screenResult.triggeredRecalculations!.join(" · ")}</div>
              )}
              {screenResult.errors.length > 0 && (
                <div className="mt-2 space-y-1 rounded border border-red-200 bg-white p-2">
                  <div className="font-semibold text-red-600">失败行明细</div>
                  {screenResult.errors.slice(0, 10).map((e, i) => (
                    <div key={i} className="font-mono text-[10px] text-red-500">行{e.rowIndex} · {e.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== B-1：抄数 CSV 导入 ===== */}
      <Card className="border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            导入抄数 CSV（manual）
            <Badge variant="blue">B-1</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/40 p-6 text-center hover:border-blue-400 hover:bg-blue-50">
            <FileSpreadsheet className="h-7 w-7 text-blue-300" />
            <span className="text-xs text-zinc-500">
              {manualFile ? <span className="font-medium text-blue-600">{manualFile.name}</span> : "选择人工抄数 CSV（data/*.csv 或任意位置）"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { setManualFile(e.target.files?.[0] ?? null); setManualResult(null); }}
            />
          </label>
          <p className="text-[11px] text-zinc-500">
            自动识别类型：含「作品标题」列 → 作品级；含「账号/账号名称」+「粉丝数」等 → 账号级。
            <b>日期列</b>（日期/统计日期/数据日期/date）→ 作为快照 captured_at，不是上传时间。重复导入同一日期 → 更新（不重复建快照）。
          </p>
          <button
            onClick={handleManualImport}
            disabled={!manualFile || manualImporting}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {manualImporting ? "导入中（含 Baseline / Topic Performance 重算）…" : "导入抄数 CSV"}
          </button>

          {manualResult && (
            <div className={`rounded-md border p-3 text-xs ${manualResult.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              {manualResult.duplicate ? (
                <div className="flex items-center gap-1.5 font-medium text-zinc-600">⏭ 同内容文件已导入过（跳过）</div>
              ) : manualResult.ok ? (
                <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 抄数导入完成（{manualResult.detectedType === "post" ? "作品级" : "账号级"}）
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-medium text-amber-700">
                  <XCircle className="h-3.5 w-3.5" /> 部分完成 / 失败
                </div>
              )}
              {manualResult.message && <div className="mt-1 text-red-600">{manualResult.message}</div>}
              <div className="mt-1.5 grid grid-cols-2 gap-1 text-zinc-600 md:grid-cols-4">
                <span>总行数：{manualResult.totalRows}</span>
                <span>新建（账号/作品）：{manualResult.created}</span>
                <span>更新：{manualResult.updated}</span>
                <span>失败：{manualResult.failed}</span>
                <span>账号快照：{manualResult.accountSnapshots}</span>
                <span>作品快照：{manualResult.postSnapshots}</span>
                <span>幂等更新（重复日期）：{manualResult.duplicateSnapshots}</span>
                <span>需人工匹配：{manualResult.manualMatchRequired}</span>
              </div>
              {(manualResult.triggeredRecalculations?.length ?? 0) > 0 && (
                <div className="mt-1.5 text-[11px] text-emerald-700">
                  已自动触发：{manualResult.triggeredRecalculations!.join(" · ")}
                </div>
              )}
              {manualResult.errors.length > 0 && (
                <div className="mt-2 space-y-1 rounded border border-red-200 bg-white p-2">
                  <div className="font-semibold text-red-600">失败行明细（行 / 字段 / 原值 / 原因）</div>
                  {manualResult.errors.slice(0, 10).map((e, i) => (
                    <div key={i} className="font-mono text-[10px] text-red-500">
                      行{e.rowIndex} {e.field && `· ${e.field}`} {e.rawValue && `· 原值[${e.rawValue}]`} · {e.reason}
                    </div>
                  ))}
                  {manualResult.errors.length > 10 && <div className="text-[10px] text-zinc-400">… 共 {manualResult.errors.length} 条</div>}
                </div>
              )}
              {manualResult.ok && (
                <div className="mt-1.5 flex gap-3 text-[11px]">
                  <a href="/analytics/topics" className="text-blue-600 hover:underline">→ Topic Analytics 查看最新数据</a>
                  <a href="/analytics/attribution" className="text-blue-600 hover:underline">→ 涨粉归因 / 基线</a>
                  <a href="/connectors/xiaodouya" className="text-blue-600 hover:underline">→ 账号数据新鲜度</a>
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-500">
            <div className="mb-1 font-semibold text-zinc-600">抄数 CSV 模板（列名可中可英；空值 / "-" / 百分比 / 千分位均容忍）</div>
            <code className="block overflow-x-auto whitespace-pre text-zinc-500">
{`# 账号级（data/account-metrics.csv）
日期,平台,账号,粉丝数,新增粉丝,主页访问,曝光,播放,互动
2026-09-03,视频号,唯元智创,58,0,-,-,38,-

# 作品级（data/post-metrics.csv）
日期,平台,账号,作品标题,作品链接,播放量,点赞数,评论数,分享数,收藏数,完播率
2026-09-03,视频号,唯元智创,盘点一周AI大事…,https://…,364,3,0,1,5,8.6%`}
            </code>
            <div className="mt-1">CLI 批量：<code className="rounded bg-zinc-100 px-1">pnpm data:import-manual &lt;file&gt;</code> / <code className="rounded bg-zinc-100 px-1">pnpm data:import-manual-all</code></div>
          </div>
        </CardContent>
      </Card>

      {/* ===== 小豆芽 CSV 导入（原有） ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UploadCloud className="h-4 w-4 text-blue-600" />小豆芽 CSV 导入</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 p-8 text-center hover:border-blue-300 hover:bg-blue-50/50">
            <FileSpreadsheet className="h-8 w-8 text-zinc-300" />
            <span className="text-xs text-zinc-500">
              {file ? <span className="font-medium text-blue-600">{file.name}</span> : "点击选择 CSV 文件"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? "导入中…" : "开始导入"}
          </button>

          {result && (
            <div className={`rounded-md border p-3 text-xs ${result.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              {result.ok && result.result ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 导入完成
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-zinc-600 md:grid-cols-3">
                    <span>总行数：{result.result.totalRows}</span>
                    <span>成功：{result.result.successRows}</span>
                    <span>失败：{result.result.failedRows}</span>
                    <span>匹配发布：{result.result.matchedPublications}</span>
                    <span>快照创建：{result.result.snapshotsCreated}</span>
                  </div>
                  {result.result.failedRows > 0 && <div className="mt-1 text-amber-600">部分行失败，详见「小豆芽」页批次日志。</div>}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-medium text-red-600">
                  <XCircle className="h-3.5 w-3.5" /> {result.error ?? "导入失败"}
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-500">
            <div className="mb-1 font-semibold text-zinc-600">CSV 模板（示例表头）</div>
            <code className="block overflow-x-auto whitespace-pre text-zinc-500">
{`作品ID,作品标题,发布时间,平台,账号名称,作品链接,播放量,点赞数,评论数,分享数,收藏数
douyin_001,AI Agent 治理全景解读,2026-08-28 10:00,douyin,AI工场官方号,https://www.douyin.com/video/001,52300,1830,214,96,340`}
            </code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>说明</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-xs text-zinc-500">
          <p>· 编码：自动检测 UTF-8 / UTF-8 BOM / GBK。</p>
          <p>· 匹配规则（规格 §37）：Post ID → URL → 平台+账号+时间 → 标题相似度 → 人工确认（小豆芽页可手动匹配）。</p>
          <p>· 抄数数据 data_source=manual：Live Mode 视为真实数据参与评分；seed 演示数据继续排除。</p>
          <p>· 快照幂等键：账号 = 账号+captured_at+来源；作品 = 作品+captured_at+来源。重复导入同一日期 → updated。</p>
          <p>· 数据留痕：每次导入生成 data_import_batches + audit_logs 记录。</p>
        </CardContent>
      </Card>
    </div>
  );
}
