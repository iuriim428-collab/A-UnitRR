import { pgTable, text, serial, timestamp, integer, numeric, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ozonAdReportsTable = pgTable("ozon_ad_reports", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  period: text("period"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ozonAdRowsTable = pgTable("ozon_ad_rows", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => ozonAdReportsTable.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  tool: text("tool"),
  placement: text("placement"),
  campaignId: text("campaign_id"),
  spend: numeric("spend", { precision: 14, scale: 6 }).notNull().default("0"),
  drr: numeric("drr", { precision: 8, scale: 4 }),
  sales: numeric("sales", { precision: 14, scale: 2 }).notNull().default("0"),
  orders: integer("orders").notNull().default(0),
  ctr: numeric("ctr", { precision: 10, scale: 6 }),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  cart: integer("cart").notNull().default(0),
  cartConversion: numeric("cart_conversion", { precision: 10, scale: 6 }),
  cpo: numeric("cpo", { precision: 14, scale: 6 }),
  cpc: numeric("cpc", { precision: 14, scale: 6 }),
});

export const insertOzonAdReportSchema = createInsertSchema(ozonAdReportsTable).omit({ id: true, importedAt: true });
export type InsertOzonAdReport = z.infer<typeof insertOzonAdReportSchema>;
export type OzonAdReport = typeof ozonAdReportsTable.$inferSelect;
export type OzonAdRow = typeof ozonAdRowsTable.$inferSelect;
