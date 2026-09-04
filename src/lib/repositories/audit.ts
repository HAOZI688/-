import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, type AuditLog } from "@/lib/db/schema";

/**
 * Audit Repository（规格 §83）：关键数据变动留痕。
 * actor 约定：user 或 ai:<workflow_run_id>。
 */
export const auditRepository = {
  async log(input: Omit<AuditLog, "id" | "createdAt">) {
    const rows = await db.insert(auditLogs).values(input).returning();
    return rows[0];
  },

  async list(limit = 100) {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  },

  async listByEntity(entityType: string, entityId: string) {
    return db
      .select()
      .from(auditLogs)
      .where(sql`${auditLogs.entityType} = ${entityType} and ${auditLogs.entityId} = ${entityId}::uuid`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
  },
};
