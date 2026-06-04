import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ymBoostReportsTable = pgTable("ym_boost_reports", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  period: text("period"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ymBoostSkusTable = pgTable("ym_boost_skus", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => ymBoostReportsTable.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  campaignIds: text("campaign_ids"),
  campaignNames: text("campaign_names"),
  impressionsBoost: integer("impressions_boost").notNull().default(0),
  impressionsAll: integer("impressions_all").notNull().default(0),
  clicksBoost: integer("clicks_boost").notNull().default(0),
  clicksAll: integer("clicks_all").notNull().default(0),
  cartBoost: integer("cart_boost").notNull().default(0),
  cartAll: integer("cart_all").notNull().default(0),
  ordersBoost: integer("orders_boost").notNull().default(0),
  ordersAll: integer("orders_all").notNull().default(0),
  deliveredBoost: integer("delivered_boost").notNull().default(0),
  deliveredAll: integer("delivered_all").notNull().default(0),
  spendBoost: numeric("spend_boost", { precision: 14, scale: 2 }).notNull().default("0"),
  spendBonuses: numeric("spend_bonuses", { precision: 14, scale: 2 }).notNull().default("0"),
  avgBoostCost: numeric("avg_boost_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  spendSharePct: numeric("spend_share_pct", { precision: 8, scale: 2 }).notNull().default("0"),
  revenueBoost: numeric("revenue_boost", { precision: 14, scale: 2 }).notNull().default("0"),
  revenueAll: numeric("revenue_all", { precision: 14, scale: 2 }).notNull().default("0"),
  revenueSharePct: numeric("revenue_share_pct", { precision: 8, scale: 2 }).notNull().default("0"),
});

export const ymBoostCampaignsTable = pgTable("ym_boost_campaigns", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => ymBoostReportsTable.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull(),
  campaignName: text("campaign_name").notNull(),
  impressionsBoost: integer("impressions_boost").notNull().default(0),
  clicksBoost: integer("clicks_boost").notNull().default(0),
  cartBoost: integer("cart_boost").notNull().default(0),
  ordersBoost: integer("orders_boost").notNull().default(0),
  deliveredBoost: integer("delivered_boost").notNull().default(0),
  spendBoost: numeric("spend_boost", { precision: 14, scale: 2 }).notNull().default("0"),
  spendBonuses: numeric("spend_bonuses", { precision: 14, scale: 2 }).notNull().default("0"),
  spendSharePct: numeric("spend_share_pct", { precision: 8, scale: 2 }).notNull().default("0"),
  revenueBoost: numeric("revenue_boost", { precision: 14, scale: 2 }).notNull().default("0"),
});

export const insertYmBoostReportSchema = createInsertSchema(ymBoostReportsTable).omit({ id: true, importedAt: true });
export type InsertYmBoostReport = z.infer<typeof insertYmBoostReportSchema>;
export type YmBoostReport = typeof ymBoostReportsTable.$inferSelect;
export type YmBoostSku = typeof ymBoostSkusTable.$inferSelect;
export type YmBoostCampaign = typeof ymBoostCampaignsTable.$inferSelect;
