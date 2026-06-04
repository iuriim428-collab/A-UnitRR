import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";

export const ymCpmReportsTable = pgTable("ym_cpm_reports", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  period: text("period"),
  attribution: text("attribution"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ymCpmCampaignRowsTable = pgTable("ym_cpm_campaign_rows", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => ymCpmReportsTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  campaignId: text("campaign_id").notNull(),
  campaignName: text("campaign_name").notNull(),
  impressions: integer("impressions").default(0),
  reach: integer("reach").default(0),
  clicks: integer("clicks").default(0),
  ctr: numeric("ctr", { precision: 8, scale: 4 }).default("0"),
  frequency: numeric("frequency", { precision: 8, scale: 4 }).default("0"),
  cartAdds: integer("cart_adds").default(0),
  orders: integer("orders").default(0),
  conversionPct: numeric("conversion_pct", { precision: 8, scale: 4 }).default("0"),
  orderRevenue: numeric("order_revenue", { precision: 14, scale: 2 }).default("0"),
  cpo: numeric("cpo", { precision: 14, scale: 2 }).default("0"),
  calcSpend: numeric("calc_spend", { precision: 14, scale: 2 }).default("0"),
  spendSharePct: numeric("spend_share_pct", { precision: 8, scale: 4 }).default("0"),
  cpm: numeric("cpm", { precision: 14, scale: 2 }).default("0"),
  actualSpend: numeric("actual_spend", { precision: 14, scale: 2 }).default("0"),
  bonuses: numeric("bonuses", { precision: 14, scale: 2 }).default("0"),
});

export const ymCpmSkuRowsTable = pgTable("ym_cpm_sku_rows", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => ymCpmReportsTable.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  cartAdds: integer("cart_adds").default(0),
  orders: integer("orders").default(0),
  cpm: numeric("cpm", { precision: 14, scale: 2 }).default("0"),
  calcSpend: numeric("calc_spend", { precision: 14, scale: 2 }).default("0"),
  revenue: numeric("revenue", { precision: 14, scale: 2 }).default("0"),
  campaignIds: text("campaign_ids"),
  campaignNames: text("campaign_names"),
});

export type YmCpmReport = typeof ymCpmReportsTable.$inferSelect;
export type YmCpmCampaignRow = typeof ymCpmCampaignRowsTable.$inferSelect;
export type YmCpmSkuRow = typeof ymCpmSkuRowsTable.$inferSelect;
