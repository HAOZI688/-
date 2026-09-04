import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Workspace / User（规格 §5 实体清单）。
 * V1 单工作区、无认证；表结构预留多租户扩展（规格 §91 预留）。
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 200 }).notNull().unique(),
  name: varchar("name", { length: 200 }),
  role: varchar("role", { length: 50 }).notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
