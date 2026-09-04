import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "MM-dd HH:mm", { locale: zhCN });
}

export function fmtDay(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "yyyy-MM-dd", { locale: zhCN });
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("zh-CN");
}
