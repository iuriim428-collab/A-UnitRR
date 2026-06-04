import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ozonSalesReportsTable = pgTable("ozon_sales_reports", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  period: text("period"),
  seller: text("seller"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ozonSalesRowsTable = pgTable("ozon_sales_rows", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => ozonSalesReportsTable.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  cat1: text("cat1"),
  cat2: text("cat2"),
  cat3: text("cat3"),
  brand: text("brand"),
  model: text("model"),
  fulfillment: text("fulfillment"),
  sku: text("sku").notNull(),
  article: text("article"),
  abcRevenue: text("abc_revenue"),
  abcOrders: text("abc_orders"),
  ordersRevenue: numeric("orders_revenue", { precision: 14, scale: 2 }).default("0"),
  revenDynamic: numeric("reven_dynamic", { precision: 8, scale: 4 }),
  searchPosition: numeric("search_position", { precision: 8, scale: 2 }),
  searchPosDynamic: numeric("search_pos_dynamic", { precision: 8, scale: 4 }),
  impressions: integer("impressions").default(0),
  impressionsDynamic: numeric("impressions_dynamic", { precision: 8, scale: 4 }),
  cardVisits: integer("card_visits").default(0),
  cardVisitsDynamic: numeric("card_visits_dynamic", { precision: 8, scale: 4 }),
  cartConversion: numeric("cart_conversion", { precision: 8, scale: 6 }),
  cartConversionDynamic: numeric("cart_conversion_dynamic", { precision: 8, scale: 4 }),
  cartAdds: integer("cart_adds").default(0),
  cartAddsDynamic: numeric("cart_adds_dynamic", { precision: 8, scale: 4 }),
  ordersQty: integer("orders_qty").default(0),
  ordersQtyDynamic: numeric("orders_qty_dynamic", { precision: 8, scale: 4 }),
  cancellations: integer("cancellations").default(0),
  cancellationsDynamic: numeric("cancellations_dynamic", { precision: 8, scale: 4 }),
  returns: integer("returns").default(0),
  returnsDynamic: numeric("returns_dynamic", { precision: 8, scale: 4 }),
  supplyRecommendation: text("supply_recommendation"),
  supplyQty: integer("supply_qty"),
});

export const insertOzonSalesReportSchema = createInsertSchema(ozonSalesReportsTable).omit({ id: true, importedAt: true });
export type OzonSalesReport = typeof ozonSalesReportsTable.$inferSelect;
export type OzonSalesRow = typeof ozonSalesRowsTable.$inferSelect;
