import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ISO week 计算：返回 "2026W36" 格式 */
export function isoWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  return `${d.getFullYear()}W${String(weekNum).padStart(2, "0")}`;
}

/** 上一个完整自然周（周一 00:00 ~ 周日 23:59） */
export function previousCompleteWeek(): { weekKey: string; start: Date; end: Date } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0=周一
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - day);
  const start = new Date(thisMonday);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { weekKey: isoWeekKey(start), start, end };
}
