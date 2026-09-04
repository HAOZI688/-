import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditAction } from "./enums";

/**
 * Audit Log（规格 §83）：关键数据变动的不可抵赖记录。
 * Topic 修改 / Source 核验 / Workflow 执行 / Content 修改 / Publication 修改 / 数据导入 / 匹配。
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: auditAction("action").notNull(),
    entityType: varchar("entity_type", { length: 60 }),
    entityId: uuid("entity_id"),
    actor: varchar("actor", { length: 200 }), // user id 或 ai:workflow_run_id
    before: jsonb("before"),
    after: jsonb("after"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
