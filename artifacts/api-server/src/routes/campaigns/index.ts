import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable, keywordsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateCampaignBody,
  UpdateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  DeleteCampaignParams,
} from "@workspace/api-zod";

const router = Router();

function buildKeywordWithCpo(kw: typeof keywordsTable.$inferSelect, incomePerSale: number) {
  const spend = Number(kw.spend);
  const orders = kw.orders;
  const cpo = orders > 0 ? spend / orders : 0;
  const lossPerOrder = cpo > incomePerSale ? cpo - incomePerSale : null;
  return {
    ...kw,
    spend,
    cpo,
    lossPerOrder,
  };
}

async function getCampaignStats(campaignId: number) {
  const keywords = await db.select().from(keywordsTable).where(eq(keywordsTable.campaignId, campaignId));
  const totalSpend = keywords.reduce((s, k) => s + Number(k.spend), 0);
  const totalOrders = keywords.reduce((s, k) => s + k.orders, 0);
  const avgCpo = totalOrders > 0 ? totalSpend / totalOrders : 0;
  return { totalSpend, totalOrders, avgCpo };
}

router.get("/campaigns", async (req, res) => {
  const campaigns = await db.select().from(campaignsTable).orderBy(campaignsTable.createdAt);
  const result = await Promise.all(
    campaigns.map(async (c) => {
      const stats = await getCampaignStats(c.id);
      return { ...c, ...stats };
    })
  );
  res.json(result);
});

router.post("/campaigns", async (req, res) => {
  const body = CreateCampaignBody.parse(req.body);
  const [campaign] = await db.insert(campaignsTable).values({
    productId: body.productId,
    name: body.name,
    status: body.status,
  }).returning();
  res.status(201).json({ ...campaign, totalSpend: 0, totalOrders: 0, avgCpo: 0 });
});

router.get("/campaigns/:id", async (req, res) => {
  const { id } = GetCampaignParams.parse({ id: Number(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, campaign.productId));
  const incomePerSale = product
    ? Number(product.price) - (Number(product.price) * Number(product.wbCommission)) / 100 - Number(product.logisticsCost) - Number(product.costPrice)
    : 0;

  const keywords = await db.select().from(keywordsTable).where(eq(keywordsTable.campaignId, id));
  const enrichedKeywords = keywords.map((kw) => buildKeywordWithCpo(kw, incomePerSale));

  const totalSpend = enrichedKeywords.reduce((s, k) => s + k.spend, 0);
  const totalOrders = enrichedKeywords.reduce((s, k) => s + k.orders, 0);
  const avgCpo = totalOrders > 0 ? totalSpend / totalOrders : 0;

  res.json({ ...campaign, totalSpend, totalOrders, avgCpo, keywords: enrichedKeywords });
});

router.patch("/campaigns/:id", async (req, res) => {
  const { id } = UpdateCampaignParams.parse({ id: Number(req.params.id) });
  const body = UpdateCampaignBody.parse(req.body);
  const [existing] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Campaign not found" });
  const [updated] = await db.update(campaignsTable).set({
    ...(body.name ? { name: body.name } : {}),
    ...(body.status ? { status: body.status } : {}),
  }).where(eq(campaignsTable.id, id)).returning();
  const stats = await getCampaignStats(id);
  res.json({ ...updated, ...stats });
});

router.delete("/campaigns/:id", async (req, res) => {
  const { id } = DeleteCampaignParams.parse({ id: Number(req.params.id) });
  await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
  res.status(204).send();
});

export default router;
