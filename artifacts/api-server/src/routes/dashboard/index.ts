import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, campaignsTable, keywordsTable, experimentsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";

const router = Router();

async function getIncomeForProduct(productId: number): Promise<number> {
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) return 0;
  return Number(product.price) - (Number(product.price) * Number(product.wbCommission)) / 100 - Number(product.logisticsCost) - Number(product.costPrice);
}

router.get("/dashboard/summary", async (req, res) => {
  const [productCount] = await db.select({ count: count() }).from(productsTable);
  const [campaignCount] = await db.select({ count: count() }).from(campaignsTable);
  const campaigns = await db.select().from(campaignsTable);
  const keywords = await db.select().from(keywordsTable);
  const [activeExpCount] = await db.select({ count: count() }).from(experimentsTable).where(sql`status = 'running'`);

  // For each keyword compute CPO and compare with product income
  let profitableKeywords = 0;
  let lossKeywords = 0;
  let totalLoss = 0;
  const totalSpend = keywords.reduce((s, k) => s + Number(k.spend), 0);
  const totalOrders = keywords.reduce((s, k) => s + k.orders, 0);

  const campaignProductMap = new Map(campaigns.map((c) => [c.id, c.productId]));
  const productIncomeCache = new Map<number, number>();

  for (const kw of keywords) {
    const productId = campaignProductMap.get(kw.campaignId);
    if (!productId) continue;
    if (!productIncomeCache.has(productId)) {
      productIncomeCache.set(productId, await getIncomeForProduct(productId));
    }
    const income = productIncomeCache.get(productId)!;
    const spend = Number(kw.spend);
    const orders = kw.orders;
    const cpo = orders > 0 ? spend / orders : 0;
    if (cpo > income && orders > 0) {
      lossKeywords++;
      totalLoss += (cpo - income) * orders;
    } else if (orders > 0) {
      profitableKeywords++;
    }
  }

  const avgCpo = totalOrders > 0 ? totalSpend / totalOrders : 0;

  res.json({
    totalProducts: productCount.count,
    totalCampaigns: campaignCount.count,
    totalKeywords: keywords.length,
    profitableKeywords,
    lossKeywords,
    totalSpend,
    totalOrders,
    avgCpo,
    totalLoss,
    activeExperiments: activeExpCount.count,
  });
});

router.get("/dashboard/cpo-analysis", async (req, res) => {
  const campaigns = await db.select().from(campaignsTable);
  const keywords = await db.select().from(keywordsTable);
  const products = await db.select().from(productsTable);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  let totalLoss = 0;
  let lossKeywordsCount = 0;
  let profitableKeywordsCount = 0;

  const items = keywords.map((kw) => {
    const campaign = campaignMap.get(kw.campaignId);
    const product = campaign ? productMap.get(campaign.productId) : undefined;
    const incomePerSale = product
      ? Number(product.price) - (Number(product.price) * Number(product.wbCommission)) / 100 - Number(product.logisticsCost) - Number(product.costPrice)
      : 0;
    const spend = Number(kw.spend);
    const orders = kw.orders;
    const cpo = orders > 0 ? spend / orders : 0;
    const profitable = orders === 0 || cpo <= incomePerSale;
    const lossPerOrder = !profitable ? cpo - incomePerSale : null;
    if (!profitable && orders > 0) {
      lossKeywordsCount++;
      totalLoss += lossPerOrder! * orders;
    } else if (orders > 0) {
      profitableKeywordsCount++;
    }
    return {
      keywordId: kw.id,
      phrase: kw.phrase,
      cluster: kw.cluster,
      campaignName: campaign?.name ?? "—",
      productName: product?.name ?? "—",
      spend,
      orders,
      cpo,
      incomePerSale,
      profitable,
      lossPerOrder,
      status: kw.status,
    };
  });

  // Sort by loss descending
  items.sort((a, b) => (b.lossPerOrder ?? 0) - (a.lossPerOrder ?? 0));

  res.json({ items, totalLoss, lossKeywordsCount, profitableKeywordsCount });
});

export default router;
