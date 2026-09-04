/**
 * V4 Live Operation Mode（规格 §19-§20）：
 * - APP_MODE=development（默认）：全部数据可见（含 seed 演示数据）
 * - APP_MODE=live：真实运营模式，Dashboard/Analytics/Weekly Planning 排除 seed 数据
 * - 数据来源标记：每条核心运营数据必须知道来源（data_source 列）
 */
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export type AppMode = "development" | "live";

export function appMode(): AppMode {
  return process.env.APP_MODE === "live" ? "live" : "development";
}

export function isLiveMode(): boolean {
  return appMode() === "live";
}

/** live 模式下排除 seed 数据的 drizzle 条件（development 返回 undefined = 不过滤） */
export function excludeSeedCondition(column: PgColumn): SQL | undefined {
  if (!isLiveMode()) return undefined;
  return sql`${column} <> 'seed'`;
}

/** 数据来源中文标签（详情/列表展示用） */
export const DATA_SOURCE_LABELS: Record<string, string> = {
  seed: "演示数据",
  manual: "人工录入",
  xiaodouya_import: "小豆芽导入",
  xiaodouya_api: "小豆芽 API",
  workflow: "工作流产出",
  user_input: "用户输入",
  historical_import: "历史导入",
};
