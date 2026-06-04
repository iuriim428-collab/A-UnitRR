import { Router } from "express";
import { db } from "@workspace/db";
import {
  ozonSalesRowsTable, ozonSalesReportsTable,
  ozonAdRowsTable, ozonAdReportsTable,
  ymCpmSkuRowsTable, ymCpmReportsTable,
  ymBoostSkusTable, ymBoostReportsTable,
} from "@workspace/db";
import { eq, ilike, or, desc } from "drizzle-orm";

const router = Router();

// GET /sku-card?article=hang10gr
router.get("/sku-card", async (req, res) => {
  const article = req.query.article as string;
  if (!article || article.trim() === "") {
    return res.status(400).json({ error: "Укажите артикул" });
  }
  const q = article.trim();

  // --- Ozon Sales rows for this article ---
  const ozonSalesRows = await db
    .select({
      id: ozonSalesRowsTable.id,
      reportId: ozonSalesRowsTable.reportId,
      period: ozonSalesReportsTable.period,
      productName: ozonSalesRowsTable.productName,
      sku: ozonSalesRowsTable.sku,
      article: ozonSalesRowsTable.article,
      fulfillment: ozonSalesRowsTable.fulfillment,
      cat1: ozonSalesRowsTable.cat1,
      cat2: ozonSalesRowsTable.cat2,
      abcRevenue: ozonSalesRowsTable.abcRevenue,
      abcOrders: ozonSalesRowsTable.abcOrders,
      ordersRevenue: ozonSalesRowsTable.ordersRevenue,
      revenDynamic: ozonSalesRowsTable.revenDynamic,
      searchPosition: ozonSalesRowsTable.searchPosition,
      searchPosDynamic: ozonSalesRowsTable.searchPosDynamic,
      impressions: ozonSalesRowsTable.impressions,
      impressionsDynamic: ozonSalesRowsTable.impressionsDynamic,
      cardVisits: ozonSalesRowsTable.cardVisits,
      cartConversion: ozonSalesRowsTable.cartConversion,
      cartAdds: ozonSalesRowsTable.cartAdds,
      ordersQty: ozonSalesRowsTable.ordersQty,
      cancellations: ozonSalesRowsTable.cancellations,
      returns: ozonSalesRowsTable.returns,
      supplyRecommendation: ozonSalesRowsTable.supplyRecommendation,
      supplyQty: ozonSalesRowsTable.supplyQty,
    })
    .from(ozonSalesRowsTable)
    .innerJoin(ozonSalesReportsTable, eq(ozonSalesRowsTable.reportId, ozonSalesReportsTable.id))
    .where(
      or(
        ilike(ozonSalesRowsTable.article, q),
        eq(ozonSalesRowsTable.sku, q),
      )
    )
    .orderBy(desc(ozonSalesReportsTable.importedAt));

  // --- Ozon Ad rows for this article (aggregate per report) ---
  const ozonAdRowsRaw = await db
    .select({
      reportId: ozonAdRowsTable.reportId,
      period: ozonAdReportsTable.period,
      sku: ozonAdRowsTable.sku,
      spend: ozonAdRowsTable.spend,
      orders: ozonAdRowsTable.orders,
      sales: ozonAdRowsTable.sales,
      impressions: ozonAdRowsTable.impressions,
      clicks: ozonAdRowsTable.clicks,
    })
    .from(ozonAdRowsTable)
    .innerJoin(ozonAdReportsTable, eq(ozonAdRowsTable.reportId, ozonAdReportsTable.id))
    .where(eq(ozonAdRowsTable.sku, q))
    .orderBy(desc(ozonAdReportsTable.importedAt));

  // Aggregate ozon ad by report
  const ozonAdByReport = new Map<number, {
    reportId: number; period: string | null;
    spend: number; orders: number; sales: number; impressions: number; clicks: number;
  }>();
  for (const r of ozonAdRowsRaw) {
    const ex = ozonAdByReport.get(r.reportId);
    if (ex) {
      ex.spend += Number(r.spend);
      ex.orders += r.orders;
      ex.sales += Number(r.sales);
      ex.impressions += r.impressions;
      ex.clicks += r.clicks;
    } else {
      ozonAdByReport.set(r.reportId, {
        reportId: r.reportId, period: r.period,
        spend: Number(r.spend), orders: r.orders, sales: Number(r.sales),
        impressions: r.impressions, clicks: r.clicks,
      });
    }
  }
  const ozonAd = [...ozonAdByReport.values()].map((r) => ({
    ...r,
    cpo: r.orders > 0 ? r.spend / r.orders : null,
    drr: r.sales > 0 ? (r.spend / r.sales) * 100 : null,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null,
  }));

  // --- YM CPM rows for this article ---
  const ymCpmRows = await db
    .select({
      reportId: ymCpmSkuRowsTable.reportId,
      period: ymCpmReportsTable.period,
      sku: ymCpmSkuRowsTable.sku,
      productName: ymCpmSkuRowsTable.productName,
      impressions: ymCpmSkuRowsTable.impressions,
      clicks: ymCpmSkuRowsTable.clicks,
      cartAdds: ymCpmSkuRowsTable.cartAdds,
      orders: ymCpmSkuRowsTable.orders,
      cpm: ymCpmSkuRowsTable.cpm,
      calcSpend: ymCpmSkuRowsTable.calcSpend,
      revenue: ymCpmSkuRowsTable.revenue,
      campaignNames: ymCpmSkuRowsTable.campaignNames,
    })
    .from(ymCpmSkuRowsTable)
    .innerJoin(ymCpmReportsTable, eq(ymCpmSkuRowsTable.reportId, ymCpmReportsTable.id))
    .where(ilike(ymCpmSkuRowsTable.sku, q))
    .orderBy(desc(ymCpmReportsTable.importedAt));

  const ymCpm = ymCpmRows.map((r) => {
    const spend = Number(r.calcSpend);
    const revenue = Number(r.revenue);
    const orders = r.orders ?? 0;
    return {
      ...r,
      cpo: orders > 0 ? spend / orders : null,
      drr: revenue > 0 ? (spend / revenue) * 100 : null,
      ctr: (r.impressions ?? 0) > 0 ? ((r.clicks ?? 0) / (r.impressions ?? 0)) * 100 : null,
    };
  });

  // --- YM CPC Boost rows for this article ---
  const ymCpcRows = await db
    .select({
      reportId: ymBoostSkusTable.reportId,
      period: ymBoostReportsTable.period,
      sku: ymBoostSkusTable.sku,
      productName: ymBoostSkusTable.productName,
      impressionsBoost: ymBoostSkusTable.impressionsBoost,
      clicksBoost: ymBoostSkusTable.clicksBoost,
      cartBoost: ymBoostSkusTable.cartBoost,
      ordersBoost: ymBoostSkusTable.ordersBoost,
      spendBoost: ymBoostSkusTable.spendBoost,
      revenueBoost: ymBoostSkusTable.revenueBoost,
    })
    .from(ymBoostSkusTable)
    .innerJoin(ymBoostReportsTable, eq(ymBoostSkusTable.reportId, ymBoostReportsTable.id))
    .where(ilike(ymBoostSkusTable.sku, q))
    .orderBy(desc(ymBoostReportsTable.importedAt));

  const ymCpc = ymCpcRows.map((r) => {
    const spend = Number(r.spendBoost);
    const revenue = Number(r.revenueBoost);
    const orders = r.ordersBoost ?? 0;
    return {
      ...r,
      cpo: orders > 0 ? spend / orders : null,
      drr: revenue > 0 ? (spend / revenue) * 100 : null,
    };
  });

  // Find product name from any source
  const productName =
    ozonSalesRows[0]?.productName ??
    ymCpmRows[0]?.productName ??
    ymCpcRows[0]?.productName ??
    null;

  const found = ozonSalesRows.length > 0 || ozonAd.length > 0 || ymCpm.length > 0 || ymCpc.length > 0;

  res.json({ article: q, productName, found, ozonSales: ozonSalesRows, ozonAd, ymCpm, ymCpc });
});

export default router;
