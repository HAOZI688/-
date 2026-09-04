/**
 * 极简 RFC 4180 CSV 解析器（无依赖）。
 * 支持：引号字段、字段内逗号/换行、双引号转义、CRLF。
 * V1 小豆芽 File Import 模式使用；XLSX 需先转 CSV（导入页提示）。
 */

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  /** 原始单元格矩阵（首行 = 表头） */
  matrix: string[][];
}

export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // 尾部字段
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 去除全空行
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!clean.length) return { headers: [], rows: [], matrix: [] };

  const headers = clean[0].map((h) => h.trim());
  const matrix = clean.slice(1).map((r) => {
    const out = [...r];
    while (out.length < headers.length) out.push("");
    return out.slice(0, headers.length);
  });

  return {
    headers,
    matrix,
    rows: matrix.map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    }),
  };
}

/** 从 Next.js FormData 的 File 读取文本（CSV 常用 UTF-8，带 BOM 时剥离） */
export async function readCsvFile(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  // 剥离 UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  // GBK 兼容尝试：含 � 时提示转 UTF-8（V1 不做全量编码探测）
  return buf.toString("utf8");
}
