import { Router } from "express";
import { db } from "@workspace/db";
import { keywordsTable, campaignsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateKeywordBody,
  UpdateKeywordBody,
  ListKeywordsQueryParams,
  UpdateKeywordParams,
  DeleteKeywordParams,
  MoveKeywordToMinusParams,
} from "@workspace/api-zod";

const router = Router();

async function getIncomeForCampaign(campaignId: number): Promise<number> {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign) return 0;
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, campaign.productId));
  if (!product) return 0;
  return Number(product.price) - (Number(product.price) * Number(product.wbCommission)) / 100 - Number(product.logisticsCost) - Number(product.costPrice);
}

function enrichKeyword(kw: typeof keywordsTable.$inferSelect, incomePerSale: number) {
  const spend = Number(kw.spend);
  const orders = kw.orders;
  const cpo = orders > 0 ? spend / orders : 0;
  const lossPerOrder = cpo > incomePerSale ? cpo - incomePerSale : null;
  return { ...kw, spend, cpo, lossPerOrder };
}

router.get("/keywords", async (req, res) => {
  const query = ListKeywordsQueryParams.parse(req.query);
  const rows = query.campaignId
    ? await db.select().from(keywordsTable).where(eq(keywordsTable.campaignId, query.campaignId))
    : await db.select().from(keywordsTable).orderBy(keywordsTable.createdAt);

  const result = await Promise.all(
    rows.map(async (kw) => {
      const income = await getIncomeForCampaign(kw.campaignId);
      return enrichKeyword(kw, income);
    })
  );
  res.json(result);
});

router.post("/keywords", async (req, res) => {
  const body = CreateKeywordBody.parse(req.body);
  const [kw] = await db.insert(keywordsTable).values({
    campaignId: body.campaignId,
    phrase: body.phrase,
    cluster: body.cluster,
    spend: String(body.spend),
    orders: body.orders,
    status: "active",
  }).returning();
  const income = await getIncomeForCampaign(kw.campaignId);
  res.status(201).json(enrichKeyword(kw, income));
});

router.patch("/keywords/:id", async (req, res) => {
  const { id } = UpdateKeywordParams.parse({ id: Number(req.params.id) });
  const body = UpdateKeywordBody.parse(req.body);
  const [existing] = await db.select().from(keywordsTable).where(eq(keywordsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Keyword not found" });
  const updateData: Record<string, unknown> = {};
  if (body.phrase !== undefined) updateData.phrase = body.phrase;
  if (body.cluster !== undefined) updateData.cluster = body.cluster;
  if (body.spend !== undefined) updateData.spend = String(body.spend);
  if (body.orders !== undefined) updateData.orders = body.orders;
  if (body.status !== undefined) updateData.status = body.status;
  const [updated] = await db.update(keywordsTable).set(updateData).where(eq(keywordsTable.id, id)).returning();
  const income = await getIncomeForCampaign(updated.campaignId);
  res.json(enrichKeyword(updated, income));
});

router.delete("/keywords/:id", async (req, res) => {
  const { id } = DeleteKeywordParams.parse({ id: Number(req.params.id) });
  await db.delete(keywordsTable).where(eq(keywordsTable.id, id));
  res.status(204).send();
});

router.post("/keywords/:id/move-to-minus", async (req, res) => {
  const { id } = MoveKeywordToMinusParams.parse({ id: Number(req.params.id) });
  const [existing] = await db.select().from(keywordsTable).where(eq(keywordsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Keyword not found" });
  const [updated] = await db.update(keywordsTable).set({ status: "minus" }).where(eq(keywordsTable.id, id)).returning();
  const income = await getIncomeForCampaign(updated.campaignId);
  res.json(enrichKeyword(updated, income));
});

export default router;
