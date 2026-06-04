import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { ozonSalesReportsTable, ozonSalesRowsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const n = (v: unknown): number => { const x = Number(v); return isNaN(x) ? 0 : x; };
const ns = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "" || v === "–" || v === "-") return null;
  const x = Number(v);
  return isNaN(x) ? null : String(x);
};
const ni = (v: unknown): number => Math.round(n(v));

// POST /ozon/import/sales-report
router.post("/ozon/import/sales-report", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets["По товарам"];
    if (!sheet) return res.status(400).json({ error: "Лист «По товарам» не найден." });

    const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Row 0: period, row 7: seller, rows 9-11: headers, row 12: totals, rows 13+: data
    const period = raw[0]?.[0] ? String(raw[0][0]).replace("Период: ", "").trim() : undefined;
    const seller = raw[7]?.[1] ? String(raw[7][1]).trim() : undefined;

    // Data rows start at index 13 (skip header rows 9-11 and totals row 12)
    const dataRows = raw.slice(13).filter(
      (r) => r[0] && String(r[0]).trim() !== "Итого и среднее" && String(r[0]).trim() !== ""
    );

    const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const [report] = await db.insert(ozonSalesReportsTable).values({ filename, period, seller }).returning();

    let rowsCreated = 0;
    for (const r of dataRows) {
      const supplyQtyRaw = r[30];
      const supplyQty = supplyQtyRaw !== null && supplyQtyRaw !== undefined && supplyQtyRaw !== "–" && supplyQtyRaw !== "-"
        ? ni(supplyQtyRaw)
        : null;

      await db.insert(ozonSalesRowsTable).values({
        reportId: report.id,
        productName: String(r[0] ?? "").trim(),
        cat1: r[1] ? String(r[1]) : null,
        cat2: r[2] ? String(r[2]) : null,
        cat3: r[3] ? String(r[3]) : null,
        brand: r[4] ? String(r[4]) : null,
        model: r[5] ? String(r[5]) : null,
        fulfillment: r[6] ? String(r[6]) : null,
        sku: String(r[7] ?? ""),
        article: r[8] ? String(r[8]) : null,
        abcRevenue: r[9] ? String(r[9]) : null,
        abcOrders: r[10] ? String(r[10]) : null,
        ordersRevenue: String(n(r[11])),
        revenDynamic: ns(r[12]),
        searchPosition: ns(r[13]),
        searchPosDynamic: ns(r[14]),
        impressions: ni(r[15]),
        impressionsDynamic: ns(r[16]),
        cardVisits: ni(r[17]),
        cardVisitsDynamic: ns(r[18]),
        cartConversion: ns(r[19]),
        cartConversionDynamic: ns(r[20]),
        cartAdds: ni(r[21]),
        cartAddsDynamic: ns(r[22]),
        ordersQty: ni(r[23]),
        ordersQtyDynamic: ns(r[24]),
        cancellations: ni(r[25]),
        cancellationsDynamic: ns(r[26]),
        returns: ni(r[27]),
        returnsDynamic: ns(r[28]),
        supplyRecommendation: r[29] ? String(r[29]) : null,
        supplyQty,
      });
      rowsCreated++;
    }

    res.json({ success: true, reportId: report.id, period, seller, rowsCreated, message: `Импорт завершён: ${rowsCreated} товаров` });
  } catch (err) {
    req.log.error({ err }, "Ozon sales import failed");
    res.status(500).json({ error: "Ошибка при обработке файла" });
  }
});

// GET /ozon/sales-reports
router.get("/ozon/sales-reports", async (req, res) => {
  const reports = await db.select().from(ozonSalesReportsTable).orderBy(desc(ozonSalesReportsTable.importedAt));
  res.json(reports);
});

// GET /ozon/sales-reports/:id/rows
router.get("/ozon/sales-reports/:id/rows", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });

  const rows = await db
    .select()
    .from(ozonSalesRowsTable)
    .where(eq(ozonSalesRowsTable.reportId, id))
    .orderBy(desc(ozonSalesRowsTable.ordersRevenue));

  const enriched = rows.map((r) => {
    const revenue = Number(r.ordersRevenue);
    const orders = r.ordersQty ?? 0;
    const visits = r.cardVisits ?? 0;
    const impressions = r.impressions ?? 0;
    const cartConv = Number(r.cartConversion ?? 0) * 100;
    const visitToOrder = visits > 0 ? (orders / visits) * 100 : 0;
    const ctr = impressions > 0 ? (visits / impressions) * 100 : 0;
    const netOrders = orders - (r.cancellations ?? 0) - (r.returns ?? 0);
    const isUrgent = r.supplyRecommendation?.includes("Срочно") ?? false;
    return { ...r, cartConvPct: cartConv, visitToOrderPct: visitToOrder, ctr, netOrders, isUrgent };
  });

  res.json(enriched);
});

// DELETE /ozon/sales-reports/:id
router.delete("/ozon/sales-reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });
  await db.delete(ozonSalesReportsTable).where(eq(ozonSalesReportsTable.id, id));
  res.json({ success: true });
});

export default router;
