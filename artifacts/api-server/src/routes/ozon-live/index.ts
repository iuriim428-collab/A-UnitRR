import { Router } from "express";
import { db } from "@workspace/db";
import {
  ozonSalesRowsTable, ozonSalesReportsTable,
  ozonAdRowsTable, ozonAdReportsTable,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";

const router = Router();
const BASE = "https://api-seller.ozon.ru";
const PERF_BASE = "https://api-performance.ozon.ru";

// --- Performance API helpers ---

let perfTokenCache: { token: string; expiresAt: number } | null = null;

async function getPerfToken(): Promise<string> {
  if (perfTokenCache && Date.now() < perfTokenCache.expiresAt) {
    return perfTokenCache.token;
  }
  const res = await fetch(`${PERF_BASE}/api/client/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.OZON_PERF_CLIENT_ID,
      client_secret: process.env.OZON_PERF_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Perf token: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  perfTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000 - 60000 };
  return data.access_token;
}

async function perfGet<T = any>(path: string): Promise<T> {
  const token = await getPerfToken();
  const res = await fetch(`${PERF_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Perf API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function headers() {
  return {
    "Client-Id": process.env.OZON_CLIENT_ID ?? "",
    "Api-Key": process.env.OZON_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

async function ozonPost<T = any>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ozon ${path} → ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

// Fetch analytics (only revenue + ordered_units are reliably available)
async function fetchAnalytics(from: string, to: string, extraDimension?: string) {
  const dimension = extraDimension ? ["sku", extraDimension] : ["sku"];
  const data = await ozonPost<{ result: { data: any[] } }>("/v1/analytics/data", {
    date_from: from,
    date_to: to,
    dimension,
    metrics: ["revenue", "ordered_units"],
    sort: [{ key: "revenue", order: "DESC" }],
    limit: 1000,
    offset: 0,
  });
  return data.result.data;
}

// Count cancelled FBO orders per SKU in a date range
async function fetchCancellations(from: string, to: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await ozonPost<{ result: any[] }>("/v2/posting/fbo/list", {
      dir: "desc",
      filter: {
        since: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.000Z`,
        status: "cancelled",
      },
      limit,
      offset,
      with: { analytics_data: false, financial_data: false },
    });

    const postings = data.result ?? [];
    for (const posting of postings) {
      for (const product of posting.products ?? []) {
        const sku = String(product.sku);
        map.set(sku, (map.get(sku) ?? 0) + (product.quantity ?? 1));
      }
    }

    if (postings.length < limit) break;
    offset += limit;
    if (offset > 5000) break; // safety
  }

  return map;
}

// Fetch all products with offer_id and sku
async function fetchProductMap(): Promise<Map<string, { offerId: string; productId: number }>> {
  const map = new Map<string, { offerId: string; productId: number }>();
  let lastId = "";

  while (true) {
    const data = await ozonPost<{ result: { items: any[]; last_id: string } }>("/v3/product/list", {
      filter: {},
      last_id: lastId,
      limit: 100,
    });

    const items = data.result?.items ?? [];
    for (const item of items) {
      // product_id maps to sku via analytics
      map.set(String(item.product_id), { offerId: item.offer_id, productId: item.product_id });
    }

    lastId = data.result?.last_id ?? "";
    if (items.length < 100 || !lastId) break;
  }

  return map;
}

// Fetch FBO stock for a list of SKUs
async function fetchStock(skus: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (skus.length === 0) return map;

  try {
    const data = await ozonPost<{ result: any[] }>("/v1/product/info/stocks-by-warehouse/fbo", {
      skus,
      limit: 1000,
    });
    for (const item of data.result ?? []) {
      map.set(String(item.sku), (map.get(String(item.sku)) ?? 0) + (item.present ?? 0));
    }
  } catch {
    // stock endpoint optional — ignore errors
  }
  return map;
}

// GET /api/ozon-live/products?from=2026-05-01&to=2026-05-30
router.get("/ozon-live/products", async (req, res) => {
  const to = (req.query.to as string) ?? new Date().toISOString().slice(0, 10);
  const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Parallel: analytics + cancellations + product map + DB ad coverage
  const [analyticsRows, cancellations, productMap, dbAdSkus, dbSalesSkus] = await Promise.all([
    fetchAnalytics(from, to),
    fetchCancellations(from, to),
    fetchProductMap(),
    // Which SKUs have ad data in DB?
    db.selectDistinct({ sku: ozonAdRowsTable.sku }).from(ozonAdRowsTable).then((rows) => new Set(rows.map((r) => r.sku))),
    // Which SKUs have sales/visibility data in DB?
    db.selectDistinct({ sku: ozonSalesRowsTable.sku }).from(ozonSalesRowsTable).then((rows) => new Set(rows.map((r) => r.sku))),
  ]);

  const skus = analyticsRows.map((r: any) => r.dimensions[0].id);
  const stock = await fetchStock(skus);

  const rows = analyticsRows.map((row: any) => {
    const sku = row.dimensions[0].id;
    const name = row.dimensions[0].name;
    const [revenue, orders] = row.metrics as number[];
    const cancelled = cancellations.get(sku) ?? 0;
    const stockQty = stock.get(sku) ?? null;
    const cancellationRate = orders > 0 ? (cancelled / (orders + cancelled)) * 100 : 0;
    const hasAdData = dbAdSkus.has(sku);
    const hasSalesData = dbSalesSkus.has(sku);

    return { sku, name, revenue, orders, cancelled, cancellationRate, stockQty, hasAdData, hasSalesData };
  });

  res.json({ from, to, rows });
});

// GET /api/ozon-live/sku/:sku?from=2026-05-01&to=2026-05-30
router.get("/ozon-live/sku/:sku", async (req, res) => {
  const { sku } = req.params;
  const to = (req.query.to as string) ?? new Date().toISOString().slice(0, 10);
  const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [summaryRows, dailyRows, cancellations, stock, dbSalesRows, dbAdRows] = await Promise.all([
    ozonPost<{ result: { data: any[] } }>("/v1/analytics/data", {
      date_from: from,
      date_to: to,
      dimension: ["sku"],
      filters: [{ key: "sku", op: "EQ", value: sku }],
      metrics: ["revenue", "ordered_units"],
      sort: [{ key: "revenue", order: "DESC" }],
      limit: 1,
      offset: 0,
    }).then((d) => d.result.data),
    ozonPost<{ result: { data: any[] } }>("/v1/analytics/data", {
      date_from: from,
      date_to: to,
      dimension: ["sku", "day"],
      filters: [{ key: "sku", op: "EQ", value: sku }],
      metrics: ["revenue", "ordered_units"],
      sort: [{ key: "day", order: "ASC" }],
      limit: 365,
      offset: 0,
    }).then((d) => d.result.data),
    fetchCancellations(from, to),
    fetchStock([sku]),
    // DB: latest ozon_sales_rows for this SKU
    db.select({
      period: ozonSalesReportsTable.period,
      impressions: ozonSalesRowsTable.impressions,
      impressionsDynamic: ozonSalesRowsTable.impressionsDynamic,
      cardVisits: ozonSalesRowsTable.cardVisits,
      cartConversion: ozonSalesRowsTable.cartConversion,
      cartAdds: ozonSalesRowsTable.cartAdds,
      searchPosition: ozonSalesRowsTable.searchPosition,
      searchPosDynamic: ozonSalesRowsTable.searchPosDynamic,
      abcRevenue: ozonSalesRowsTable.abcRevenue,
      abcOrders: ozonSalesRowsTable.abcOrders,
    })
      .from(ozonSalesRowsTable)
      .innerJoin(ozonSalesReportsTable, eq(ozonSalesRowsTable.reportId, ozonSalesReportsTable.id))
      .where(eq(ozonSalesRowsTable.sku, sku))
      .orderBy(desc(ozonSalesReportsTable.importedAt))
      .limit(1),
    // DB: latest ozon_ad_rows for this SKU (aggregated)
    db.select({
      period: ozonAdReportsTable.period,
      spend: ozonAdRowsTable.spend,
      orders: ozonAdRowsTable.orders,
      sales: ozonAdRowsTable.sales,
      impressions: ozonAdRowsTable.impressions,
      clicks: ozonAdRowsTable.clicks,
    })
      .from(ozonAdRowsTable)
      .innerJoin(ozonAdReportsTable, eq(ozonAdRowsTable.reportId, ozonAdReportsTable.id))
      .where(eq(ozonAdRowsTable.sku, sku))
      .orderBy(desc(ozonAdReportsTable.importedAt)),
  ]);

  const summaryRow = summaryRows[0];
  const cancelled = cancellations.get(sku) ?? 0;
  const stockQty = stock.get(sku) ?? null;

  const summary = summaryRow
    ? {
        sku,
        name: summaryRow.dimensions[0].name,
        revenue: summaryRow.metrics[0] as number,
        orders: summaryRow.metrics[1] as number,
        cancelled,
        cancellationRate:
          (summaryRow.metrics[1] as number) + cancelled > 0
            ? (cancelled / ((summaryRow.metrics[1] as number) + cancelled)) * 100
            : 0,
        stockQty,
      }
    : null;

  const daily = dailyRows.map((row: any) => ({
    day: row.dimensions[1].id as string,
    revenue: row.metrics[0] as number,
    orders: row.metrics[1] as number,
  }));

  // Aggregate ad rows from DB
  const adAgg = dbAdRows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend ?? 0);
      acc.orders += r.orders ?? 0;
      acc.sales += Number(r.sales ?? 0);
      acc.impressions += r.impressions ?? 0;
      acc.clicks += r.clicks ?? 0;
      return acc;
    },
    { spend: 0, orders: 0, sales: 0, impressions: 0, clicks: 0 }
  );
  const adPeriod = dbAdRows[0]?.period ?? null;
  const dbAd = dbAdRows.length > 0
    ? {
        period: adPeriod,
        spend: adAgg.spend,
        orders: adAgg.orders,
        impressions: adAgg.impressions,
        clicks: adAgg.clicks,
        cpo: adAgg.orders > 0 ? adAgg.spend / adAgg.orders : null,
        drr: adAgg.sales > 0 ? (adAgg.spend / adAgg.sales) * 100 : null,
        ctr: adAgg.impressions > 0 ? (adAgg.clicks / adAgg.impressions) * 100 : null,
      }
    : null;

  const dbSales = dbSalesRows[0]
    ? {
        period: dbSalesRows[0].period,
        impressions: dbSalesRows[0].impressions,
        impressionsDynamic: Number(dbSalesRows[0].impressionsDynamic ?? 0),
        cardVisits: dbSalesRows[0].cardVisits,
        cartConversion: Number(dbSalesRows[0].cartConversion ?? 0),
        cartAdds: dbSalesRows[0].cartAdds,
        searchPosition: Number(dbSalesRows[0].searchPosition ?? 0),
        searchPosDynamic: Number(dbSalesRows[0].searchPosDynamic ?? 0),
        abcRevenue: dbSalesRows[0].abcRevenue,
        abcOrders: dbSalesRows[0].abcOrders,
      }
    : null;

  res.json({ sku, from, to, summary, daily, dbSales, dbAd });
});

// Campaign cache: refreshed once per hour
let campaignCache: { data: any[]; skuMap: Map<string, string[]>; fetchedAt: number } | null = null;

async function loadCampaigns() {
  if (campaignCache && Date.now() - campaignCache.fetchedAt < 3600_000) return campaignCache;

  const data = await perfGet<{ list: any[] }>("/api/client/campaign");
  const campaigns = data.list ?? [];

  // For each campaign, fetch its objects (SKUs) in parallel, max 10 at a time
  const skuMap = new Map<string, string[]>(); // sku → campaign titles[]

  const chunks: any[][] = [];
  for (let i = 0; i < campaigns.length; i += 10) chunks.push(campaigns.slice(i, i + 10));

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (camp: any) => {
        try {
          const obj = await perfGet<{ list: { id: string }[] }>(`/api/client/campaign/${camp.id}/objects?limit=100&offset=0`);
          camp.skus = (obj.list ?? []).map((o: any) => o.id);
          for (const sku of camp.skus) {
            const arr = skuMap.get(sku) ?? [];
            arr.push(camp.title || camp.id);
            skuMap.set(sku, arr);
          }
        } catch {
          camp.skus = [];
        }
      })
    );
  }

  campaignCache = { data: campaigns, skuMap, fetchedAt: Date.now() };
  return campaignCache;
}

// GET /api/ozon-live/campaigns
router.get("/ozon-live/campaigns", async (_req, res) => {
  const { data } = await loadCampaigns();

  const campaigns = data.map((c: any) => ({
    id: c.id,
    title: c.title,
    state: c.state,
    type: c.advObjectType,
    paymentType: c.PaymentType,
    placement: c.placement,
    fromDate: c.fromDate,
    toDate: c.toDate,
    dailyBudget: Number(c.dailyBudget ?? 0),
    budget: Number(c.budget ?? 0),
    skus: c.skus ?? [],
    isActive: c.state === "CAMPAIGN_STATE_RUNNING",
  }));

  res.json({ campaigns });
});

// GET /api/ozon-live/campaigns/by-sku/:sku
router.get("/ozon-live/campaigns/by-sku/:sku", async (req, res) => {
  const { sku } = req.params;
  const { data } = await loadCampaigns();

  const matched = data
    .filter((c: any) => (c.skus ?? []).includes(sku))
    .map((c: any) => ({
      id: c.id,
      title: c.title,
      state: c.state,
      type: c.advObjectType,
      paymentType: c.PaymentType,
      placement: c.placement,
      fromDate: c.fromDate,
      toDate: c.toDate,
      dailyBudget: Number(c.dailyBudget ?? 0),
      isActive: c.state === "CAMPAIGN_STATE_RUNNING",
    }));

  res.json({ sku, campaigns: matched });
});

export default router;
