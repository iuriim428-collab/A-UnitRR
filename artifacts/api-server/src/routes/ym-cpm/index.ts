import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { ymCpmReportsTable, ymCpmCampaignRowsTable, ymCpmSkuRowsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const n = (v: unknown) => { const x = Number(v); return isNaN(x) ? 0 : x; };
const ns = (v: unknown) => { if (v === null || v === undefined || v === "") return "0"; const x = Number(v); return isNaN(x) ? "0" : String(x); };

// POST /ym/import/cpm-boost
router.post("/ym/import/cpm-boost", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });

    const campSheet = wb.Sheets["Отчёт по кампаниям"];
    const skuSheet = wb.Sheets["Отчёт по товарам"];
    if (!campSheet || !skuSheet) {
      return res.status(400).json({ error: "Листы «Отчёт по кампаниям» и «Отчёт по товарам» не найдены." });
    }

    const campRaw: (string | number | null)[][] = XLSX.utils.sheet_to_json(campSheet, { header: 1 });
    const skuRaw: (string | number | null)[][] = XLSX.utils.sheet_to_json(skuSheet, { header: 1 });

    // Period at row[2][1], attribution at row[3][1]
    const period = campRaw[2]?.[1] ? String(campRaw[2][1]).trim() : undefined;
    const attribution = campRaw[3]?.[1] ? String(campRaw[3][1]).trim() : undefined;

    // Campaign data rows start at index 14 (row 13 is header)
    const campDataRows = campRaw.slice(14).filter((r) => r[0] && String(r[0]).trim() !== "");

    // SKU rows: row 0 is header, rows 1+ are data
    const skuDataRows = skuRaw.slice(1).filter((r) => r[0] && String(r[0]).trim() !== "");

    const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const [report] = await db.insert(ymCpmReportsTable).values({ filename, period, attribution }).returning();

    // Insert campaign rows
    for (const r of campDataRows) {
      await db.insert(ymCpmCampaignRowsTable).values({
        reportId: report.id,
        date: String(r[0]).trim(),
        campaignId: String(r[1]),
        campaignName: String(r[2] ?? "").trim(),
        impressions: Math.round(n(r[3])),
        reach: Math.round(n(r[4])),
        clicks: Math.round(n(r[5])),
        ctr: ns(r[6]),
        frequency: ns(r[7]),
        cartAdds: Math.round(n(r[8])),
        orders: Math.round(n(r[9])),
        conversionPct: ns(r[10]),
        orderRevenue: ns(r[11]),
        cpo: ns(r[12]),
        calcSpend: ns(r[13]),
        spendSharePct: ns(r[14]),
        cpm: ns(r[15]),
        actualSpend: ns(r[16]),
        bonuses: ns(r[17]),
      });
    }

    // Insert SKU rows
    for (const r of skuDataRows) {
      await db.insert(ymCpmSkuRowsTable).values({
        reportId: report.id,
        sku: String(r[0]).trim(),
        productName: String(r[1] ?? "").trim(),
        impressions: Math.round(n(r[2])),
        clicks: Math.round(n(r[3])),
        cartAdds: Math.round(n(r[4])),
        orders: Math.round(n(r[5])),
        cpm: ns(r[6]),
        calcSpend: ns(r[7]),
        revenue: ns(r[8]),
        campaignIds: r[9] ? String(r[9]) : null,
        campaignNames: r[10] ? String(r[10]) : null,
      });
    }

    res.json({
      success: true,
      reportId: report.id,
      period,
      campaignRowsCreated: campDataRows.length,
      skuRowsCreated: skuDataRows.length,
      message: `Импорт завершён: ${campDataRows.length} записей по кампаниям, ${skuDataRows.length} товаров`,
    });
  } catch (err) {
    req.log.error({ err }, "YM CPM import failed");
    res.status(500).json({ error: "Ошибка при обработке файла" });
  }
});

// GET /ym/cpm-reports
router.get("/ym/cpm-reports", async (_req, res) => {
  const reports = await db.select().from(ymCpmReportsTable).orderBy(desc(ymCpmReportsTable.importedAt));
  res.json(reports);
});

// GET /ym/cpm-reports/:id/skus
router.get("/ym/cpm-reports/:id/skus", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });
  const rows = await db.select().from(ymCpmSkuRowsTable).where(eq(ymCpmSkuRowsTable.reportId, id));
  const enriched = rows.map((r) => {
    const spend = Number(r.calcSpend);
    const revenue = Number(r.revenue);
    const orders = r.orders ?? 0;
    const clicks = r.clicks ?? 0;
    const impressions = r.impressions ?? 0;
    const cpo = orders > 0 ? spend / orders : null;
    const drr = revenue > 0 ? (spend / revenue) * 100 : null;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
    const cartConv = clicks > 0 ? ((r.cartAdds ?? 0) / clicks) * 100 : null;
    return { ...r, cpo, drr, ctr, cartConv };
  }).sort((a, b) => Number(b.calcSpend) - Number(a.calcSpend));
  res.json(enriched);
});

// GET /ym/cpm-reports/:id/campaigns
router.get("/ym/cpm-reports/:id/campaigns", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });
  const rows = await db.select().from(ymCpmCampaignRowsTable).where(eq(ymCpmCampaignRowsTable.reportId, id));

  // Aggregate by campaign
  const bycamp = new Map<string, {
    campaignId: string; campaignName: string;
    impressions: number; reach: number; clicks: number;
    cartAdds: number; orders: number; orderRevenue: number;
    calcSpend: number; actualSpend: number; bonuses: number;
    days: number;
  }>();

  for (const r of rows) {
    const key = r.campaignId;
    const ex = bycamp.get(key);
    if (ex) {
      ex.impressions += r.impressions ?? 0;
      ex.reach += r.reach ?? 0;
      ex.clicks += r.clicks ?? 0;
      ex.cartAdds += r.cartAdds ?? 0;
      ex.orders += r.orders ?? 0;
      ex.orderRevenue += Number(r.orderRevenue);
      ex.calcSpend += Number(r.calcSpend);
      ex.actualSpend += Number(r.actualSpend);
      ex.bonuses += Number(r.bonuses);
      ex.days++;
    } else {
      bycamp.set(key, {
        campaignId: r.campaignId, campaignName: r.campaignName,
        impressions: r.impressions ?? 0, reach: r.reach ?? 0, clicks: r.clicks ?? 0,
        cartAdds: r.cartAdds ?? 0, orders: r.orders ?? 0,
        orderRevenue: Number(r.orderRevenue), calcSpend: Number(r.calcSpend),
        actualSpend: Number(r.actualSpend), bonuses: Number(r.bonuses), days: 1,
      });
    }
  }

  // Aggregate by date for trend
  const byDate = new Map<string, { impressions: number; orders: number; calcSpend: number; actualSpend: number }>();
  for (const r of rows) {
    const ex = byDate.get(r.date);
    if (ex) {
      ex.impressions += r.impressions ?? 0;
      ex.orders += r.orders ?? 0;
      ex.calcSpend += Number(r.calcSpend);
      ex.actualSpend += Number(r.actualSpend);
    } else {
      byDate.set(r.date, {
        impressions: r.impressions ?? 0, orders: r.orders ?? 0,
        calcSpend: Number(r.calcSpend), actualSpend: Number(r.actualSpend),
      });
    }
  }

  const campaigns = [...bycamp.values()].map((c) => ({
    ...c,
    cpo: c.orders > 0 ? c.calcSpend / c.orders : null,
    drr: c.orderRevenue > 0 ? (c.calcSpend / c.orderRevenue) * 100 : null,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null,
    cpm: c.impressions > 0 ? (c.calcSpend / c.impressions) * 1000 : null,
  })).sort((a, b) => b.calcSpend - a.calcSpend);

  const trend = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  res.json({ campaigns, trend });
});

// DELETE /ym/cpm-reports/:id
router.delete("/ym/cpm-reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });
  await db.delete(ymCpmReportsTable).where(eq(ymCpmReportsTable.id, id));
  res.json({ success: true });
});

export default router;
