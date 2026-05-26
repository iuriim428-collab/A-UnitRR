import { Router, type IRouter } from "express";

const router: IRouter = Router();
const OZON_BASE = "https://api-seller.ozon.ru";

/**
 * POST /api/ozon/report
 * Headers: X-Ozon-Client-Id, X-Ozon-Api-Key
 * Body: { dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Fetches all finance transactions from Ozon Seller API v3 with pagination.
 */
router.post("/ozon/report", async (req, res) => {
  const clientId = req.headers["x-ozon-client-id"];
  const apiKey   = req.headers["x-ozon-api-key"];

  if (!clientId || !apiKey) {
    res.status(401).json({ error: "Нужны заголовки X-Ozon-Client-Id и X-Ozon-Api-Key" });
    return;
  }

  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны параметры dateFrom и dateTo (YYYY-MM-DD)" });
    return;
  }

  req.log.info({ dateFrom, dateTo }, "ozon api report fetch");

  const allOps: unknown[] = [];
  let page = 1;

  try {
    while (true) {
      const upstream = await fetch(`${OZON_BASE}/v3/finance/transaction/list`, {
        method: "POST",
        headers: {
          "Client-Id": String(clientId),
          "Api-Key": String(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            date: {
              from: `${dateFrom}T00:00:00.000Z`,
              to:   `${dateTo}T23:59:59.000Z`,
            },
            transaction_type: "all",
            posting_number: "",
          },
          page,
          page_size: 1000,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => String(upstream.status));
        req.log.warn({ status: upstream.status }, "ozon api error");
        res.status(upstream.status).json({ error: text });
        return;
      }

      const body = (await upstream.json()) as {
        result: { operations: unknown[]; page_count: number; row_count: number };
      };
      const { operations, page_count } = body.result;
      allOps.push(...operations);

      if (page >= page_count) break;
      page++;
    }

    req.log.info({ operations: allOps.length }, "ozon report done");
    res.json(allOps);
  } catch (err) {
    req.log.error({ err }, "ozon fetch error");
    res.status(502).json({ error: "Не удалось связаться с Ozon API" });
  }
});

/**
 * POST /api/ozon/analytics-metrics
 * Headers: X-Ozon-Client-Id, X-Ozon-Api-Key
 * Body: { dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Fetches product analytics from Ozon Seller Analytics API grouped by SKU (item_id).
 * Returns metrics: показы, посещения карточки, в корзину, заказы, выручка, отмены, возвраты, позиция.
 */
router.post("/ozon/analytics-metrics", async (req, res) => {
  const clientId = req.headers["x-ozon-client-id"];
  const apiKey   = req.headers["x-ozon-api-key"];

  if (!clientId || typeof clientId !== "string" || !apiKey || typeof apiKey !== "string") {
    res.status(401).json({ error: "Нужны Client-Id и API-Key" });
    return;
  }

  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны dateFrom и dateTo (YYYY-MM-DD)" });
    return;
  }

  req.log.info({ dateFrom, dateTo }, "ozon analytics-metrics fetch");

  const METRICS = [
    "hits_view_search",   // показы в поиске и каталоге
    "hits_view_pdp",      // посещения карточки товара
    "hits_tocart",        // добавления в корзину
    "ordered_units",      // заказано товаров
    "revenue",            // заказано на сумму
    "cancellations",      // отменено
    "returns",            // возвращено
    "position_category",  // позиция в каталоге (может быть 0 если недоступна)
  ];

  try {
    const resp = await fetch(`${OZON_BASE}/v1/analytics/data`, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date_from: dateFrom,
        date_to: dateTo,
        dimension: ["sku"],
        filters: [],
        metrics: METRICS,
        limit: 1000,
        offset: 0,
        sort: [{ key: "ordered_units", order: "DESC" }],
      }),
    });

    const data = await resp.json() as {
      result?: { data?: Array<{ dimensions?: Array<{ id?: string; name?: string }>; metrics?: number[] }> };
      message?: string;
    };

    if (!resp.ok) {
      res.status(resp.status).json({ error: data?.message ?? `Ozon API ${resp.status}` });
      return;
    }

    const items = (data.result?.data ?? []).map(row => {
      const vals = row.metrics ?? [];
      return {
        itemId:           String(row.dimensions?.[0]?.id ?? ""),
        name:             String(row.dimensions?.[0]?.name ?? ""),
        hitsViewSearch:   vals[0] ?? 0,
        hitsViewPdp:      vals[1] ?? 0,
        hitsTocart:       vals[2] ?? 0,
        orderedUnits:     vals[3] ?? 0,
        revenue:          vals[4] ?? 0,
        cancellations:    vals[5] ?? 0,
        returns:          vals[6] ?? 0,
        positionCategory: vals[7] ?? 0,
      };
    });

    req.log.info({ count: items.length }, "ozon analytics-metrics done");
    res.json({ items });
  } catch (err) {
    req.log.error({ err }, "analytics-metrics error");
    res.status(502).json({ error: "Ошибка подключения к Ozon API" });
  }
});

/**
 * POST /api/ozon/product-lookup
 * Headers: X-Ozon-Client-Id, X-Ozon-Api-Key
 * Body: { sku: number }   ← Ozon item_id (число из URL страницы товара)
 *
 * Пытается получить данные товара по его Ozon SKU (item_id).
 * Работает для товаров продавца; для чужих может вернуть ограниченные данные.
 */
router.post("/ozon/product-lookup", async (req, res) => {
  const clientId = req.headers["x-ozon-client-id"];
  const apiKey   = req.headers["x-ozon-api-key"];

  if (!clientId || typeof clientId !== "string" || !apiKey || typeof apiKey !== "string") {
    res.status(401).json({ error: "Нужны Client-Id и API-Key (используйте Ozon API-режим)" });
    return;
  }

  const { sku } = req.body as { sku?: number };
  if (!sku) {
    res.status(400).json({ error: "Нужен параметр sku (Ozon item_id)" });
    return;
  }

  req.log.info({ sku }, "ozon product lookup");

  try {
    const resp = await fetch(`${OZON_BASE}/v2/product/info`, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sku }),
    });

    const data = await resp.json() as {
      result?: {
        name?: string;
        price?: string;
        min_price?: string;
        old_price?: string;
        rating?: number;
        reviews_count?: number;
        images?: string[];
      };
      message?: string;
    };

    if (!resp.ok) {
      res.status(resp.status).json({ error: data?.message ?? `Ozon API ${resp.status}` });
      return;
    }

    const p = data.result ?? {};
    res.json({
      sku,
      name: p.name ?? "",
      price: parseFloat(p.price ?? "0") || 0,
      minPrice: parseFloat(p.min_price ?? "0") || 0,
      oldPrice: parseFloat(p.old_price ?? "0") || 0,
      rating: p.rating ?? null,
      reviewsCount: p.reviews_count ?? null,
      image: p.images?.[0] ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "product lookup error");
    res.status(502).json({ error: "Ошибка подключения к Ozon API" });
  }
});

/**
 * POST /api/ozon/performance-report
 * Headers: X-Perf-Client-Id, X-Perf-Client-Secret
 * Body: { dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Fetches Ozon Performance API (advertising) data:
 *  - list of campaigns with statistics (spend, views, clicks, orders, revenue, ДРР)
 *  - per-article (offer_id) ad spend breakdown (spend distributed across products in each campaign)
 */
const PERF_BASE = "https://performance.ozon.ru";

interface PerfCampaignRaw {
  id: string;
  title: string;
  state: string;
  advObjectType: string;
  budget: number;
  dailyBudget: number;
}

interface PerfStatRaw {
  id: string;
  moneySpent: string | number;
  views: number;
  clicks: number;
  orders: number;
  revenue: string | number;
}

interface PerfObjectRaw {
  id?: string;
  article?: string;
  name?: string;
  title?: string;
  status?: string;
}

router.post("/ozon/performance-report", async (req, res) => {
  const perfClientId     = req.headers["x-perf-client-id"];
  const perfClientSecret = req.headers["x-perf-client-secret"];

  if (!perfClientId || !perfClientSecret) {
    res.status(401).json({ error: "Нужны заголовки X-Perf-Client-Id и X-Perf-Client-Secret" });
    return;
  }

  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны параметры dateFrom и dateTo" });
    return;
  }

  req.log.info({ dateFrom, dateTo }, "perf report fetch");

  try {
    // 1. OAuth token
    const tokenResp = await fetch(`${PERF_BASE}/api/client/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        client_id: String(perfClientId),
        client_secret: String(perfClientSecret),
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenData = await tokenResp.json() as { access_token?: string; error_description?: string; message?: string };
    if (!tokenResp.ok) {
      const msg = tokenData.error_description ?? tokenData.message ?? `Ошибка авторизации (${tokenResp.status})`;
      res.status(401).json({ error: `Performance API: ${msg}` });
      return;
    }
    const auth = `Bearer ${tokenData.access_token}`;

    // 2. Campaigns list
    const campResp = await fetch(`${PERF_BASE}/api/client/campaign`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const campData = await campResp.json() as { list?: PerfCampaignRaw[] };
    const campaigns: PerfCampaignRaw[] = campData.list ?? [];

    if (campaigns.length === 0) {
      res.json({ campaigns: [], spendByArticle: {} });
      return;
    }

    // 3. Statistics for all campaigns (synchronous JSON endpoint)
    const campIds = campaigns.map(c => c.id);
    const statsResp = await fetch(`${PERF_BASE}/api/client/statistics/json`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ campaigns: campIds, dateFrom, dateTo, groupBy: "NO_GROUP_BY" }),
      signal: AbortSignal.timeout(30_000),
    });
    const statsData = await statsResp.json() as { statistics?: PerfStatRaw[] };
    const statsMap = new Map<string, PerfStatRaw>();
    for (const s of statsData.statistics ?? []) statsMap.set(s.id, s);

    // 4. Per-campaign: get objects (products) and distribute spend by article
    const spendByArticle: Record<string, number> = {};
    const results: Array<{
      id: string; title: string; state: string; type: string;
      budget: number; moneySpent: number; views: number; clicks: number;
      orders: number; revenue: number; drr: number; productsCount: number;
    }> = [];

    for (const camp of campaigns) {
      const s = statsMap.get(camp.id);
      const moneySpent = parseFloat(String(s?.moneySpent ?? 0)) || 0;
      const revenue    = parseFloat(String(s?.revenue    ?? 0)) || 0;
      const views      = s?.views  ?? 0;
      const clicks     = s?.clicks ?? 0;
      const orders     = s?.orders ?? 0;
      const drr        = revenue > 0 ? (moneySpent / revenue) * 100 : 0;

      let products: PerfObjectRaw[] = [];
      try {
        const objResp = await fetch(`${PERF_BASE}/api/client/campaign/${camp.id}/objects`, {
          headers: { Authorization: auth, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (objResp.ok) {
          const objData = await objResp.json() as { list?: PerfObjectRaw[] };
          products = objData.list ?? [];
        }
      } catch { /* skip failed objects fetch */ }

      if (moneySpent > 0 && products.length > 0) {
        const perProduct = moneySpent / products.length;
        for (const p of products) {
          const article = p.article ?? "";
          if (article) spendByArticle[article] = (spendByArticle[article] ?? 0) + perProduct;
        }
      }

      results.push({
        id: camp.id, title: camp.title, state: camp.state, type: camp.advObjectType,
        budget: camp.budget ?? 0, moneySpent, views, clicks, orders, revenue, drr,
        productsCount: products.length,
      });
    }

    req.log.info({ campaigns: results.length, skus: Object.keys(spendByArticle).length }, "perf report done");
    res.json({ campaigns: results, spendByArticle });

  } catch (err) {
    req.log.error({ err }, "perf report error");
    res.status(502).json({ error: "Не удалось связаться с Ozon Performance API" });
  }
});

export default router;
