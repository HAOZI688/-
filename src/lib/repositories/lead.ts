import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversionEvents, leads, type Lead } from "@/lib/db/schema";

/**
 * Lead Repository（规格 §80）：线索与转化事件。
 * V1 人工录入，不做复杂 CRM；预留 Salesforce/HubSpot（规格 §91）。
 */
export const leadRepository = {
  async listLeads(opts?: { status?: Lead["status"]; topicId?: string }) {
    const where = [];
    if (opts?.status) where.push(eq(leads.status, opts.status));
    if (opts?.topicId) where.push(eq(leads.topicId, opts.topicId));
    return db
      .select()
      .from(leads)
      .where(where.length ? (and(...(where as [])) as never) : undefined)
      .orderBy(desc(leads.createdAt));
  },

  async getLead(id: string) {
    const rows = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createLead(input: typeof leads.$inferInsert) {
    const rows = await db.insert(leads).values(input).returning();
    return rows[0];
  },

  async updateLead(id: string, patch: Partial<Omit<Lead, "id" | "createdAt">>) {
    const rows = await db
      .update(leads)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /* ===== Conversion Events（规格 §48） ===== */
  async listConversionEvents(topicId?: string) {
    return topicId
      ? db.select().from(conversionEvents).where(eq(conversionEvents.topicId, topicId)).orderBy(desc(conversionEvents.createdAt))
      : db.select().from(conversionEvents).orderBy(desc(conversionEvents.createdAt)).limit(200);
  },

  async createConversionEvent(input: typeof conversionEvents.$inferInsert) {
    const rows = await db.insert(conversionEvents).values(input).returning();
    return rows[0];
  },
};
