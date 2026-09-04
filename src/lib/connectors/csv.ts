/**
 * 极简 RFC 4180 CSV 解析器（无依赖）。
 * 支持：引号字段、字段内逗号/换行、双引号转义、CRLF。
 * V1 小豆芽 File Import 模式使用；XLSX 需先转 CSV（导入页提示）。
 *
 * V4 生产化（规格 §15-§19）：
 * - 编码检测：UTF-8 BOM → UTF-8；否则 UTF-8/GB18030 双试，取替换符更少者
 * - 行级错误：rows 附带 rowIndex（1 起，对应 CSV 数据行），支撑 Retry/Export Failed Rows
 * - 数值解析：支持 "1,234"、"1.2万"、"3亿"、"1.2k"
 * - 日期解析：支持 Excel 序列号、Unix 秒/毫秒、"2026-09-04 10:00"、"2026/9/4"、"2026年9月4日"
 */

export interface CsvRow {
  /** 行数据（表头 → 值） */
  data: Record<string, string>;
  /** CSV 中的行号（1 起，表头行=0），用于失败行定位 */
  rowIndex: number;
}

export interface CsvParseResult {
  headers: string[];
  rows: CsvRow[];
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
    rows: matrix.map((r, idx) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, j) => {
        obj[h] = (r[j] ?? "").trim();
      });
      return { data: obj, rowIndex: idx + 1 };
    }),
  };
}

import { createHash } from "node:crypto";

/**
 * 从 Next.js FormData 的 File 读取文本（编码自动检测）。
 * 检测顺序：UTF-8 BOM → UTF-8 严格解码 → 替换符计数 vs GB18030 → 取替换符更少者。
 * 返回解码后的文本、检测到的编码与文件 SHA-256（重复检测用）。
 */
export async function readCsvFile(file: File): Promise<{ text: string; encoding: "utf8" | "gbk"; hash: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString("utf8"), encoding: "utf8", hash };
  }
  // UTF-8 严格解码：有非法字节直接失败
  let utf8: string | null = null;
  try {
    utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    utf8 = null;
  }
  if (utf8 !== null) return { text: utf8, encoding: "utf8", hash };

  // 宽容 UTF-8（统计替换符）与 GB18030 对比
  const utf8Loose = new TextDecoder("utf-8").decode(buf);
  const gbk = new TextDecoder("gb18030").decode(buf);
  const countReplacement = (s: string) => {
    let n = 0;
    for (const ch of s) if (ch === "�") n++;
    return n;
  };
  return countReplacement(gbk) < countReplacement(utf8Loose)
    ? { text: gbk, encoding: "gbk", hash }
    : { text: utf8Loose, encoding: "utf8", hash };
}

/**
 * 数值解析：容忍千分位、中文单位（万/亿）、k/m 后缀。
 * "1,234" → 1234；"1.2万" → 12000；"3亿" → 300000000；"2.5k" → 2500
 */
export function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const s = String(v).trim().replace(/,/g, "");
  if (!s) return undefined;
  const m = s.match(/^(-?\d+(?:\.\d+)?)([万亿km]?)$/i);
  if (!m) return undefined;
  const base = Number(m[1]);
  if (Number.isNaN(base)) return undefined;
  const unit = m[2].toLowerCase();
  if (unit === "万") return Math.round(base * 10000);
  if (unit === "亿") return Math.round(base * 100000000);
  if (unit === "k") return Math.round(base * 1000);
  if (unit === "m") return Math.round(base * 1000000);
  return Math.round(base);
}

/**
 * 日期解析：Excel 序列号 / Unix 秒或毫秒 / ISO / 中文格式 / 斜杠格式。
 * 解析失败返回 null（不 throw，行级错误由调用方决定）。
 */
export function parseDate(v: string | undefined): Date | null {
  if (v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;

  // Excel 序列号（1900 日期系统，45292.5 → 2024-01-01 12:00）
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    const ms = Math.round((serial - 25569) * 86400000); // 25569 = 1970-01-01
    if (ms >= 0) {
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  // Unix 秒 / 毫秒
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // ISO / 横杠 / 斜杠 / 中文日期（秒级或分钟级）
  const normalized = s
    .replace(/年|月/g, "-")
    .replace(/日/g, "")
    .replace(/\//g, "-");
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}
