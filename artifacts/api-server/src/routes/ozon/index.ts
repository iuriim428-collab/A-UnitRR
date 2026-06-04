import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { ozonAdReportsTable, ozonAdRowsTable, ozonSalesRowsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const n = (val: unknown): number => {
  const v = Number(val);
  return isNaN(v) ? 0 : v;
};
const ns = (val: unknown): string | null => {
  if (val === "" || val === "-" || val === undefined || val === null) return null;
  const v = Number(val);
  return isNaN(v) ? null : String(v);
};

// POST /ozon/import/ad-report
router.post("/ozon/import/ad-report", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets["Statistics"];
    if (!sheet) return res.status(400).json({ error: "Лист «Statistics» не найден. Проверьте формат файла." });

    const raw: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Row 0: period line, Row 1: headers, Row 2+: data
    let period: string | undefined;
    if (raw[0]?.[0]) period = String(raw[0][0]).replace("Период: ", "").trim();

    const headers = raw[1] as string[];
    const dataRows = raw.slice(2).filter((r) => r[0]);

    const col = (name: string) => headers.indexOf(name);

    const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const [report] = await db.insert(ozonAdReportsTable).values({
      filename,
      period,
    }).returning();

    let rowsCreated = 0;
    for (const row of dataRows) {
      await db.insert(ozonAdRowsTable).values({
        reportId: report.id,
        sku: String(row[col("SKU")] ?? ""),
        productName: String(row[col("Название товара")] ?? ""),
        tool: String(row[col("Инструмент")] ?? ""),
        placement: String(row[col("Место размещения")] ?? ""),
        campaignId: String(row[col("ID кампании")] ?? ""),
        spend: String(n(row[col("Расход, ₽")])),
        drr: ns(row[col("ДРР, %")]),
        sales: String(n(row[col("Продажи, ₽")])),
        orders: n(row[col("Заказы, шт")]),
        ctr: ns(row[col("CTR, %")]),
        impressions: n(row[col("Показы")]),
        clicks: n(row[col("Клики")]),
        cart: n(row[col("В корзину")]),
        cartConversion: ns(row[col("Конверсия в корзину, %")]),
        cpo: ns(row[col("Затраты на заказ, ₽")]),
        cpc: ns(row[col("Стоимость клика, ₽")]),
      });
      rowsCreated++;
    }

    res.json({
      success: true,
      reportId: report.id,
      period,
      rowsCreated,
      message: `Импорт завершён: ${rowsCreated} строк`,
    });
  } catch (err) {
    req.log.error({ err }, "Ozon import failed");
    res.status(500).json({ error: "Ошибка при обработке файла" });
  }
});

// GET /ozon/ad-reports
router.get("/ozon/ad-reports", async (req, res) => {
  const reports = await db
    .select()
    .from(ozonAdReportsTable)
    .orderBy(desc(ozonAdReportsTable.importedAt));
  res.json(reports);
});

// GET /ozon/ad-reports/:id/rows — raw rows aggregated by SKU
router.get("/ozon/ad-reports/:id/rows", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });

  const rows = await db
    .select()
    .from(ozonAdRowsTable)
    .where(eq(ozonAdRowsTable.reportId, id));

  // Aggregate by SKU
  const bySkuMap = new Map<string, {
    sku: string; productName: string;
    spend: number; sales: number; orders: number;
    impressions: number; clicks: number; cart: number;
    tools: Set<string>;
  }>();

  for (const r of rows) {
    const key = r.sku;
    const existing = bySkuMap.get(key);
    if (existing) {
      existing.spend += Number(r.spend);
      existing.sales += Number(r.sales);
      existing.orders += r.orders;
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
      existing.cart += r.cart;
      if (r.tool) existing.tools.add(r.tool);
    } else {
      bySkuMap.set(key, {
        sku: r.sku,
        productName: r.productName,
        spend: Number(r.spend),
        sales: Number(r.sales),
        orders: r.orders,
        impressions: r.impressions,
        clicks: r.clicks,
        cart: r.cart,
        tools: new Set(r.tool ? [r.tool] : []),
      });
    }
  }

  const result = Array.from(bySkuMap.values())
    .map((s) => {
      const cpo = s.orders > 0 ? s.spend / s.orders : null;
      const drr = s.sales > 0 ? (s.spend / s.sales) * 100 : null;
      const ctr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
      const roi = s.spend > 0 ? s.sales / s.spend : null;
      return { ...s, cpo, drr, ctr, roi, tools: Array.from(s.tools) };
    })
    .sort((a, b) => b.spend - a.spend);

  res.json(result);
});

// GET /ozon/ad-reports/:id/campaigns — aggregated by campaign
router.get("/ozon/ad-reports/:id/campaigns", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });

  const rows = await db
    .select()
    .from(ozonAdRowsTable)
    .where(eq(ozonAdRowsTable.reportId, id));

  const byCampMap = new Map<string, {
    campaignId: string;
    spend: number; sales: number; orders: number;
    impressions: number; clicks: number;
    tools: Set<string>;
  }>();

  for (const r of rows) {
    const key = r.campaignId ?? "unknown";
    const existing = byCampMap.get(key);
    if (existing) {
      existing.spend += Number(r.spend);
      existing.sales += Number(r.sales);
      existing.orders += r.orders;
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
      if (r.tool) existing.tools.add(r.tool);
    } else {
      byCampMap.set(key, {
        campaignId: key,
        spend: Number(r.spend),
        sales: Number(r.sales),
        orders: r.orders,
        impressions: r.impressions,
        clicks: r.clicks,
        tools: new Set(r.tool ? [r.tool] : []),
      });
    }
  }

  const result = Array.from(byCampMap.values())
    .map((c) => {
      const cpo = c.orders > 0 ? c.spend / c.orders : null;
      const drr = c.sales > 0 ? (c.spend / c.sales) * 100 : null;
      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
      return { ...c, cpo, drr, ctr, tools: Array.from(c.tools) };
    })
    .sort((a, b) => b.spend - a.spend);

  res.json(result);
});

// GET /ozon/compare?adReportId=X&salesReportId=Y
router.get("/ozon/compare", async (req, res) => {
  const adId = Number(req.query.adReportId);
  const salesId = Number(req.query.salesReportId);
  if (isNaN(adId) || isNaN(salesId)) return res.status(400).json({ error: "Укажите adReportId и salesReportId" });

  const adRows = await db.select().from(ozonAdRowsTable).where(eq(ozonAdRowsTable.reportId, adId));
  const salesRows = await db.select().from(ozonSalesRowsTable).where(eq(ozonSalesRowsTable.reportId, salesId));

  // Aggregate ad data by SKU
  const adBySku = new Map<string, { spend: number; orders: number; sales: number; impressions: number; clicks: number }>();
  for (const r of adRows) {
    const key = String(r.sku);
    const ex = adBySku.get(key);
    if (ex) {
      ex.spend += Number(r.spend);
      ex.orders += r.orders;
      ex.sales += Number(r.sales);
      ex.impressions += r.impressions;
      ex.clicks += r.clicks;
    } else {
      adBySku.set(key, { spend: Number(r.spend), orders: r.orders, sales: Number(r.sales), impressions: r.impressions, clicks: r.clicks });
    }
  }

  const result = salesRows.map((s) => {
    const ad = adBySku.get(String(s.sku));
    const totalOrders = s.ordersQty ?? 0;
    const totalRevenue = Number(s.ordersRevenue ?? 0);
    const adSpend = ad?.spend ?? 0;
    const adOrders = ad?.orders ?? 0;
    const organicOrders = Math.max(0, totalOrders - adOrders);
    const adShare = totalOrders > 0 ? (adOrders / totalOrders) * 100 : 0;
    const adCpo = adOrders > 0 ? adSpend / adOrders : null;
    const totalCpo = totalOrders > 0 ? adSpend / totalOrders : null;
    const drr = totalRevenue > 0 ? (adSpend / totalRevenue) * 100 : null;
    const searchPos = s.searchPosition ? Number(s.searchPosition) : null;
    return {
      sku: s.sku,
      article: s.article,
      productName: s.productName,
      abcRevenue: s.abcRevenue,
      abcOrders: s.abcOrders,
      searchPosition: searchPos,
      totalOrders,
      adOrders,
      organicOrders,
      adShare,
      totalRevenue,
      adSpend,
      adCpo,
      totalCpo,
      drr,
      impressionsSearch: s.impressions ?? 0,
      impressionsAd: ad?.impressions ?? 0,
      cartConvPct: Number(s.cartConversion ?? 0) * 100,
      supplyRecommendation: s.supplyRecommendation,
      supplyQty: s.supplyQty,
      hasAdData: !!ad,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  res.json(result);
});

// DELETE /ozon/ad-reports/:id
router.delete("/ozon/ad-reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });
  await db.delete(ozonAdReportsTable).where(eq(ozonAdReportsTable.id, id));
  res.json({ success: true });
});

export default router;
