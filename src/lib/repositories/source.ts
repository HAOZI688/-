import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  sourcePacketItems,
  sourcePackets,
  sources,
  type Source,
  type SourcePacketItem,
} from "@/lib/db/schema";
import { topics } from "@/lib/db/schema";

/**
 * Source Repository（规格 §80）：来源主档 + Source Packet。
 * 数字类事实必须带 comparison_object / applicable_scope（规格 §10）。
 */
export const sourceRepository = {
  /** Source 主档（跨 Topic 复用，规格 §9） */
  async listSources() {
    return db.select().from(sources).orderBy(desc(sources.publishedAt)).limit(200);
  },

  async getSource(id: string) {
    const rows = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createSource(input: Omit<Source, "id" | "createdAt" | "updatedAt">) {
    const rows = await db.insert(sources).values(input).returning();
    return rows[0];
  },

  async updateSource(id: string, patch: Partial<Omit<Source, "id" | "createdAt" | "updatedAt">>) {
    const rows = await db
      .update(sources)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sources.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /** Source Packet：一个 Topic 一个包 */
  async getPacketByTopic(topicId: string) {
    const packet = await db.select().from(sourcePackets).where(eq(sourcePackets.topicId, topicId)).limit(1);
    if (!packet[0]) return null;
    const items = await db
      .select()
      .from(sourcePacketItems)
      .where(eq(sourcePacketItems.sourcePacketId, packet[0].id))
      .orderBy(asc(sourcePacketItems.createdAt));
    return { packet: packet[0], items };
  },

  async listPacketsWithTopic(limit = 100) {
    return db
      .select({ packet: sourcePackets, topic: topics })
      .from(sourcePackets)
      .innerJoin(topics, eq(sourcePackets.topicId, topics.id))
      .orderBy(desc(sourcePackets.updatedAt))
      .limit(limit);
  },

  async createPacket(topicId: string, notes?: string) {
    const rows = await db.insert(sourcePackets).values({ topicId, notes }).returning();
    return rows[0];
  },

  /** 包内条目逐条核验（规格 §10：来源/条件/比较对象/适用范围） */
  async addItem(packetId: string, item: Partial<typeof sourcePacketItems.$inferInsert> & { sourceName: string }) {
    const rows = await db.insert(sourcePacketItems).values({ ...item, sourcePacketId: packetId }).returning();
    return rows[0];
  },

  async addItems(packetId: string, items: (Partial<typeof sourcePacketItems.$inferInsert> & { sourceName: string })[]) {
    if (!items.length) return [];
    return db
      .insert(sourcePacketItems)
      .values(items.map((i) => ({ ...i, sourcePacketId: packetId })))
      .returning();
  },

  async verifyItem(itemId: string, status: SourcePacketItem["verificationStatus"], notes?: string) {
    const rows = await db
      .update(sourcePacketItems)
      .set({ verificationStatus: status, verifiedAt: status === "unverified" ? null : new Date(), notes })
      .where(eq(sourcePacketItems.id, itemId))
      .returning();
    return rows[0] ?? null;
  },

  /** 设置包内整体一致性（全部 verified → verified，有冲突 → conflict） */
  async setPacketConsistency(packetId: string, consistency: "verified" | "conflict" | "unverified" | "partially_verified" | "needs_update") {
    const rows = await db
      .update(sourcePackets)
      .set({ consistency, updatedAt: new Date() })
      .where(eq(sourcePackets.id, packetId))
      .returning();
    return rows[0] ?? null;
  },

  async listAllItems() {
    return db
      .select({ item: sourcePacketItems, packet: sourcePackets })
      .from(sourcePacketItems)
      .innerJoin(sourcePackets, eq(sourcePacketItems.sourcePacketId, sourcePackets.id))
      .orderBy(desc(sourcePacketItems.createdAt))
      .limit(200);
  },

  async getItemsByIds(ids: string[]) {
    return db.select().from(sourcePacketItems).where(inArray(sourcePacketItems.id, ids));
  },
};
