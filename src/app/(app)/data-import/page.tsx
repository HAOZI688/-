"use client";

import { useState } from "react";
import { importXiaodouyaCsv } from "@/app/actions/import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";

/**
 * 数据导入（规格 §73）：小豆芽 CSV 上传导入。
 */
export default function DataImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string; result?: { totalRows: number; successRows: number; failedRows: number; matchedPublications: number; snapshotsCreated: number } } | null>(null);

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

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">数据导入</h1>
        <p className="text-xs text-zinc-500">
          上传小豆芽导出的作品 CSV（UTF-8）：自动完成 检测 → 映射 → 作品入库 → 匹配 → T+1 快照。
          必需字段：作品ID / 作品标题 / 发布时间。
        </p>
      </div>

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
          <p>· 编码：CSV 须为 UTF-8（Excel 另存为 CSV 时选择 UTF-8）。</p>
          <p>· 匹配规则（规格 §37）：Post ID → URL → 平台+账号+标题相似度 → 人工确认。</p>
          <p>· 快照：导入即生成 T+1 基线，后续同步任务生成 T+3/T+7/T+30。</p>
          <p>· 数据留痕：每次导入生成 data_import_batches + audit_logs 记录。</p>
        </CardContent>
      </Card>
    </div>
  );
}
