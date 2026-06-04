import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const keywordsTable = pgTable("keywords", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  phrase: text("phrase").notNull(),
  cluster: text("cluster").notNull(),
  spend: numeric("spend", { precision: 12, scale: 2 }).notNull().default("0"),
  orders: integer("orders").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertKeywordSchema = createInsertSchema(keywordsTable).omit({ id: true, createdAt: true, status: true });
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;
export type Keyword = typeof keywordsTable.$inferSelect;
