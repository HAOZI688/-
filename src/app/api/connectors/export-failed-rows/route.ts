import { NextResponse } from "next/server";
import { connectorSyncService } from "@/lib/services/connector-sync";

/**
 * V4：导出失败行（Export Failed Rows）。
 * GET /api/connectors/export-failed-rows?batchId=xxx → CSV 下载
 * 失败行含原始行数据 + 错误原因，供运营修正后重新导入。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");
  if (!batchId) {
    return NextResponse.json({ ok: false, error: "缺少 batchId" }, { status: 400 });
  }
  const result = await connectorSyncService.exportFailedRows(batchId);
  if (!result.ok || !result.csv) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 404 });
  }
  // UTF-8 BOM 便于 Excel 直接打开中文
  return new NextResponse("﻿" + result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="failed-rows-${batchId.slice(0, 8)}.csv"`,
    },
  });
}
