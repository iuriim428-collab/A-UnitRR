import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { productsTable, campaignsTable, keywordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

interface StatRow {
  "Название"?: string;
  "Номенклатура"?: string | number;
  "Затраты, RUB"?: number;
  "Заказанные товары, шт."?: number;
  "Показы"?: number;
  "Клики"?: number;
  "CTR(%)"?: number;
  "CPO"?: number;
  "Средняя позиция"?: number;
  "Тип конверсии"?: string;
}

interface KeywordRow {
  "Ключевая фраза"?: string;
  "Просмотры"?: number;
  "Клики"?: number;
  "CTR"?: number;
  "Затраты"?: number;
  "Дата"?: string;
}

router.post("/import/wb-report", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

  try {
    // multer passes filename in latin1 — decode to utf8
    const _filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });

    // Parse sheets
    const statSheet = wb.Sheets["Статистика"];
    const kwSheet = wb.Sheets["Статистика по ключевым словам"];

    if (!statSheet) {
      return res.status(400).json({ error: "Лист «Статистика» не найден. Проверьте формат файла." });
    }

    const statRows: StatRow[] = XLSX.utils.sheet_to_json(statSheet);
    const kwRows: KeywordRow[] = kwSheet ? XLSX.utils.sheet_to_json(kwSheet) : [];

    let productsCreated = 0;
    let campaignsCreated = 0;
    let keywordsCreated = 0;
    let keywordsUpdated = 0;

    // Filter out summary rows
    const campaignRows = statRows.filter(
      (r) => r["Название"] && r["Название"] !== "Всего по кампании" && r["Тип конверсии"]
    );

    for (const row of campaignRows) {
      const campaignName = String(row["Название"] ?? "").trim();
      const sku = String(row["Номенклатура"] ?? "").trim();
      if (!campaignName || !sku) continue;

      // Find or create product by SKU
      let [product] = await db.select().from(productsTable).where(eq(productsTable.sku, sku));
      if (!product) {
        const [created] = await db.insert(productsTable).values({
          name: campaignName,
          sku,
          price: "0",
          wbCommission: "15",
          logisticsCost: "0",
          costPrice: "0",
        }).returning();
        product = created;
        productsCreated++;
      }

      // Find or create campaign by name + productId
      let [campaign] = await db.select().from(campaignsTable).where(
        and(eq(campaignsTable.name, campaignName), eq(campaignsTable.productId, product.id))
      );
      if (!campaign) {
        const [created] = await db.insert(campaignsTable).values({
          productId: product.id,
          name: campaignName,
          status: "active",
        }).returning();
        campaign = created;
        campaignsCreated++;
      }
    }

    // Import keywords — aggregate spend per phrase+campaign by summing across dates
    interface AggKey { phrase: string; campaignName: string; spend: number; impressions: number; clicks: number; }
    const kwAgg = new Map<string, AggKey>();

    for (const row of kwRows) {
      const phrase = String(row["Ключевая фраза"] ?? "").trim();
      if (!phrase || phrase === "рекомендации") continue;
      const spend = Number(row["Затраты"] ?? 0);
      const impressions = Number(row["Просмотры"] ?? 0);
      const clicks = Number(row["Клики"] ?? 0);
      const key = phrase;
      if (kwAgg.has(key)) {
        const existing = kwAgg.get(key)!;
        existing.spend += spend;
        existing.impressions += impressions;
        existing.clicks += clicks;
      } else {
        kwAgg.set(key, { phrase, campaignName: "", spend, impressions, clicks });
      }
    }

    // Find the first campaign created in this import (link keywords to it)
    // Use the first campaign from the stat sheet
    const firstCampaignRow = campaignRows[0];
    let targetCampaign: typeof campaignsTable.$inferSelect | undefined;
    if (firstCampaignRow) {
      const campaignName = String(firstCampaignRow["Название"] ?? "").trim();
      const sku = String(firstCampaignRow["Номенклатура"] ?? "").trim();
      const [prod] = await db.select().from(productsTable).where(eq(productsTable.sku, sku));
      if (prod) {
        const [camp] = await db.select().from(campaignsTable).where(
          and(eq(campaignsTable.name, campaignName), eq(campaignsTable.productId, prod.id))
        );
        targetCampaign = camp;
      }
    }

    if (targetCampaign) {
      for (const agg of kwAgg.values()) {
        const [existing] = await db.select().from(keywordsTable).where(
          and(eq(keywordsTable.campaignId, targetCampaign.id), eq(keywordsTable.phrase, agg.phrase))
        );
        if (existing) {
          await db.update(keywordsTable).set({
            spend: String(Number(existing.spend) + agg.spend),
            orders: existing.orders, // keep existing orders
          }).where(eq(keywordsTable.id, existing.id));
          keywordsUpdated++;
        } else {
          await db.insert(keywordsTable).values({
            campaignId: targetCampaign.id,
            phrase: agg.phrase,
            cluster: agg.phrase.split(" ").slice(0, 2).join(" "),
            spend: String(agg.spend),
            orders: 0,
            status: "active",
          });
          keywordsCreated++;
        }
      }
    }

    res.json({
      success: true,
      productsCreated,
      campaignsCreated,
      keywordsCreated,
      keywordsUpdated,
      message: `Импорт завершён: ${productsCreated > 0 ? `${productsCreated} товаров, ` : ""}${campaignsCreated} кампаний, ${keywordsCreated + keywordsUpdated} ключей`,
    });
  } catch (err) {
    req.log.error({ err }, "Import failed");
    res.status(500).json({ error: "Ошибка при обработке файла" });
  }
});

export default router;
