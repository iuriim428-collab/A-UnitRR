import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  ymBoostReportsTable,
  ymBoostSkusTable,
  ymBoostCampaignsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// POST /ym/import/boost — parse YM Business Boost xlsx
router.post("/ym/import/boost", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });

    const summarySheet = wb.Sheets["Сводный отчет"];
    const campaignsSheet = wb.Sheets["По кампаниям"];

    if (!summarySheet) {
      return res.status(400).json({ error: "Лист «Сводный отчет» не найден. Проверьте формат файла." });
    }

    // Read as array of arrays to handle header row at row 4 (index 3)
    const rawRows: (string | number)[][] = XLSX.utils.sheet_to_json(summarySheet, { header: 1 });

    // Find period from row index 1
    let period: string | undefined;
    if (rawRows[1] && rawRows[1][1]) period = String(rawRows[1][1]);

    // Header is at row index 3, data starts at index 4
    const headers = rawRows[3] as string[];
    const dataRows = rawRows.slice(4).filter((r) => r[0] && String(r[0]).trim() !== "");

    const col = (name: string) => headers.indexOf(name);
    const n = (val: unknown) => Number(val ?? 0) || 0;

    // Create report record
    const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const [report] = await db.insert(ymBoostReportsTable).values({
      filename,
      period,
    }).returning();

    // Insert SKU rows
    let skusCreated = 0;
    for (const row of dataRows) {
      await db.insert(ymBoostSkusTable).values({
        reportId: report.id,
        sku: String(row[col("Ваш SKU")] ?? "").trim(),
        productName: String(row[col("Название товара")] ?? "").trim(),
        campaignIds: String(row[col("ID кампаний")] ?? ""),
        campaignNames: String(row[col("Названия кампаний")] ?? ""),
        impressionsBoost: n(row[col("Показы товара с бустом, шт.")]),
        impressionsAll: n(row[col("Все показы товара, шт.")]),
        clicksBoost: n(row[col("Клики по товару с бустом, шт.")]),
        clicksAll: n(row[col("Все клики по товару, шт.")]),
        cartBoost: n(row[col("Добавления в корзину товаров с бустом, шт.")]),
        cartAll: n(row[col("Все добавления товаров в корзину, шт.")]),
        ordersBoost: n(row[col("Заказанные товары с бустом, шт.")]),
        ordersAll: n(row[col("Все заказанные товары, шт.")]),
        deliveredBoost: n(row[col("Доставленные товары с бустом, шт.")]),
        deliveredAll: n(row[col("Всего доставлено товаров, шт.")]),
        spendBoost: String(n(row[col("Расходы на буст, ₽")])),
        spendBonuses: String(n(row[col("Списано бонусов")])),
        avgBoostCost: String(n(row[col("Средняя стоимость буста, ₽")])),
        spendSharePct: String(n(row[col("Доля расходов на буст от выручки с бустом, %")])),
        revenueBoost: String(n(row[col("Выручка с бустом, ₽")])),
        revenueAll: String(n(row[col("Вся выручка, ₽")])),
        revenueSharePct: String(n(row[col("Доля выручки с бустом от всей выручки, %")])),
      });
      skusCreated++;
    }

    // Import campaigns sheet
    let campaignsCreated = 0;
    if (campaignsSheet) {
      const campRaw: (string | number)[][] = XLSX.utils.sheet_to_json(campaignsSheet, { header: 1 });
      const campHeaders = campRaw[3] as string[];
      const campData = campRaw.slice(4).filter((r) => r[0]);
      const cc = (name: string) => campHeaders.findIndex((h) => String(h ?? "").replace(/\n/g, " ").includes(name.split(",")[0]));

      for (const row of campData) {
        await db.insert(ymBoostCampaignsTable).values({
          reportId: report.id,
          campaignId: String(row[0]),
          campaignName: String(row[1] ?? ""),
          impressionsBoost: n(row[cc("Показы")]),
          clicksBoost: n(row[cc("Клики")]),
          cartBoost: n(row[cc("Добавления в корзину")]),
          ordersBoost: n(row[cc("Заказанные")]),
          deliveredBoost: n(row[cc("Доставленные")]),
          spendBoost: String(n(row[cc("Расходы")])),
          spendBonuses: String(n(row[cc("Списано бонусов")])),
          spendSharePct: String(n(row[cc("Доля расходов")])),
          revenueBoost: String(n(row[cc("Выручка")])),
        });
        campaignsCreated++;
      }
    }

    res.json({
      success: true,
      reportId: report.id,
      period,
      skusCreated,
      campaignsCreated,
      message: `Импорт завершён: ${skusCreated} SKU, ${campaignsCreated} кампаний`,
    });
  } catch (err) {
    req.log.error({ err }, "YM import failed");
    res.status(500).json({ error: "Ошибка при обработке файла" });
  }
});

// GET /ym/boost/reports — list all imported YM boost reports
router.get("/ym/boost/reports", async (req, res) => {
  const reports = await db
    .select()
    .from(ymBoostReportsTable)
    .orderBy(desc(ymBoostReportsTable.importedAt));
  res.json(reports);
});

// GET /ym/boost/reports/:id/skus — SKU analysis for a report
router.get("/ym/boost/reports/:id/skus", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });

  const skus = await db
    .select()
    .from(ymBoostSkusTable)
    .where(eq(ymBoostSkusTable.reportId, id))
    .orderBy(desc(ymBoostSkusTable.spendBoost));

  const enriched = skus.map((s) => {
    const spend = Number(s.spendBoost) + Number(s.spendBonuses);
    const orders = s.ordersBoost;
    const revenue = Number(s.revenueBoost);
    const cpo = orders > 0 ? spend / orders : null;
    const roi = spend > 0 ? revenue / spend : null;
    const ctr = s.impressionsBoost > 0 ? (s.clicksBoost / s.impressionsBoost) * 100 : 0;
    return { ...s, cpo, roi, ctr, totalSpend: spend };
  });

  res.json(enriched);
});

// GET /ym/boost/reports/:id/campaigns — campaign stats for a report
router.get("/ym/boost/reports/:id/campaigns", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });

  const campaigns = await db
    .select()
    .from(ymBoostCampaignsTable)
    .where(eq(ymBoostCampaignsTable.reportId, id))
    .orderBy(desc(ymBoostCampaignsTable.spendBoost));

  const enriched = campaigns.map((c) => {
    const spend = Number(c.spendBoost) + Number(c.spendBonuses);
    const orders = c.ordersBoost;
    const revenue = Number(c.revenueBoost);
    const cpo = orders > 0 ? spend / orders : null;
    const roi = spend > 0 ? revenue / spend : null;
    return { ...c, cpo, roi, totalSpend: spend };
  });

  res.json(enriched);
});

// DELETE /ym/boost/reports/:id
router.delete("/ym/boost/reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });
  await db.delete(ymBoostReportsTable).where(eq(ymBoostReportsTable.id, id));
  res.json({ success: true });
});

export default router;
