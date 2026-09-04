import { index, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { conversionEventType, leadStatus, leadType } from "./enums";
import { publications } from "./publishing";
import { topics } from "./topics";

/** Lead（规格 §47）：V1 允许人工录入，不做复杂 CRM */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    publicationId: uuid("publication_id").references(() => publications.id, { onDelete: "set null" }),
    source: varchar("source", { length: 100 }),
    name: varchar("name", { length: 200 }).notNull(),
    company: varchar("company", { length: 200 }),
    contact: varchar("contact", { length: 200 }),
    leadType: leadType("lead_type").notNull().default("inbound"),
    status: leadStatus("status").notNull().default("new"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("leads_topic_idx").on(t.topicId)],
);

/** Conversion Event（规格 §48）：转化事件链 */
export const conversionEvents = pgTable(
  "conversion_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    publicationId: uuid("publication_id").references(() => publications.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    eventType: conversionEventType("event_type").notNull(),
    eventValue: numeric("event_value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("conversion_events_topic_idx").on(t.topicId),
    index("conversion_events_lead_idx").on(t.leadId),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type ConversionEvent = typeof conversionEvents.$inferSelect;
