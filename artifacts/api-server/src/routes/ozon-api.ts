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
const PERF_BASE = "https://api-performance.ozon.ru";

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
  // Optional: Seller API credentials for resolving product IDs → offer_ids (articles)
  const sellerClientId   = req.headers["x-ozon-client-id"];
  const sellerApiKey     = req.headers["x-ozon-api-key"];

  if (!perfClientId || !perfClientSecret) {
    res.status(401).json({ error: "Нужны заголовки X-Perf-Client-Id и X-Perf-Client-Secret" });
    return;
  }

  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны параметры dateFrom и dateTo" });
    return;
  }

  req.log.info({ dateFrom, dateTo, hasSellerCreds: !!(sellerClientId && sellerApiKey) }, "perf report fetch");

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
    const allCampaigns: PerfCampaignRaw[] = campData.list ?? [];

    // Keep only active (RUNNING) campaigns — user wants only enabled ones
    const campaigns = allCampaigns.filter(c => String(c.state ?? "").toUpperCase().includes("RUNNING"));

    req.log.info({ total: allCampaigns.length, active: campaigns.length }, "perf campaigns filtered");

    if (campaigns.length === 0) {
      res.json({ campaigns: [], spendByArticle: {} });
      return;
    }

    // 3. Statistics — API allows max 10 campaigns per request, batch accordingly
    const campIdsInt = campaigns.map(c => Number(c.id)).filter(n => !isNaN(n));
    const statsMap = new Map<string, PerfStatRaw>();

    for (let i = 0; i < campIdsInt.length; i += 10) {
      const chunk = campIdsInt.slice(i, i + 10);
      try {
        const statsResp = await fetch(`${PERF_BASE}/api/client/statistics/json`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({ campaigns: chunk, dateFrom, dateTo, groupBy: "NO_GROUP_BY" }),
          signal: AbortSignal.timeout(30_000),
        });
        const statsRaw = await statsResp.json() as Record<string, unknown>;
        if (statsResp.ok) {
          const statsData = statsRaw as { statistics?: PerfStatRaw[] };
          for (const s of statsData.statistics ?? []) statsMap.set(String(s.id), s);
        } else {
          req.log.warn({ status: statsResp.status, body: JSON.stringify(statsRaw).slice(0, 200) }, "perf stats chunk failed");
        }
      } catch (e) {
        req.log.warn({ err: e }, "perf stats chunk error");
      }
    }
    req.log.info({ statsEntries: statsMap.size }, "perf stats done");

    // 4. Fetch objects for all campaigns.
    //    Separate two types of IDs:
    //    a) numeric item_ids (Ozon SKU / item_id) — need Seller API resolution via `sku` param
    //    b) string offer_ids / articles — can be used directly
    const campProducts = new Map<string, string[]>(); // campId → ids
    const allItemIds   = new Set<string>(); // numeric item_ids needing sku→offer_id resolution

    // Pre-populate: if campaign objects already have offer_id/article we store directly
    const productIdToArticle = new Map<string, string>();

    for (const camp of campaigns) {
      try {
        const objResp = await fetch(`${PERF_BASE}/api/client/campaign/${camp.id}/objects`, {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(10_000),
        });
        if (objResp.ok) {
          const objRaw = await objResp.json() as { list?: Array<Record<string, unknown>> };
          const list = objRaw.list ?? [];

          if (list.length > 0) {
            req.log.info({ campId: camp.id, sampleObj: JSON.stringify(list[0]).slice(0, 200) }, "perf camp obj sample");
          }

          const ids: string[] = [];
          for (const p of list) {
            const id      = String(p.id      ?? "").trim();
            const article = String(p.article ?? p.offer_id ?? p.offerId ?? "").trim();

            if (id) {
              ids.push(id);
              if (article) {
                // article available directly — no Seller API call needed
                productIdToArticle.set(id, article);
              } else {
                // numeric id: will resolve via sku param
                const n = Number(id);
                if (!isNaN(n)) allItemIds.add(id);
              }
            } else if (article) {
              // no numeric id, but offer_id present — use as both key and value
              ids.push(article);
              productIdToArticle.set(article, article);
            }
          }
          campProducts.set(camp.id, ids);
        }
      } catch { /* skip */ }
    }

    req.log.info({
      totalIds: campProducts.size > 0 ? Array.from(campProducts.values()).flat().length : 0,
      needsResolution: allItemIds.size,
      alreadyResolved: productIdToArticle.size,
    }, "perf objects fetched");

    // 5. Resolve remaining numeric item_ids → offer_id via Seller API
    //    Use `sku` parameter (item_id ≠ product_id in Ozon's model).
    if (sellerClientId && sellerApiKey && allItemIds.size > 0) {
      const ids = Array.from(allItemIds).map(Number).filter(n => !isNaN(n));

      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        try {
          // First attempt: sku (item_id) — this is what Performance API objects return
          let infoResp = await fetch(`${OZON_BASE}/v2/product/info/list`, {
            method: "POST",
            headers: {
              "Client-Id": String(sellerClientId),
              "Api-Key":   String(sellerApiKey),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sku: batch }),
            signal: AbortSignal.timeout(15_000),
          });

          // Fall back to product_id if sku didn't work
          if (!infoResp.ok) {
            req.log.warn({ status: infoResp.status, param: "sku" }, "product info sku failed, trying product_id");
            infoResp = await fetch(`${OZON_BASE}/v2/product/info/list`, {
              method: "POST",
              headers: {
                "Client-Id": String(sellerClientId),
                "Api-Key":   String(sellerApiKey),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ product_id: batch }),
              signal: AbortSignal.timeout(15_000),
            });
          }

          if (infoResp.ok) {
            const infoData = await infoResp.json() as {
              result?: { items?: Array<{ id?: number; sku?: number; offer_id?: string }> };
            };
            for (const item of infoData.result?.items ?? []) {
              const key = String(item.id ?? item.sku ?? "");
              if (key && item.offer_id) productIdToArticle.set(key, item.offer_id);
            }
          } else {
            req.log.warn({ status: infoResp.status }, "seller product info all attempts failed");
          }
        } catch (e) {
          req.log.warn({ err: e }, "seller product info error");
        }
      }

      req.log.info({ resolved: productIdToArticle.size, of: allItemIds.size }, "perf product resolve done");
    }

    // 6. Build results and spendByArticle
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

      const productIds = campProducts.get(camp.id) ?? [];

      if (moneySpent > 0 && productIds.length > 0) {
        const perProduct = moneySpent / productIds.length;
        for (const pid of productIds) {
          const article = productIdToArticle.get(pid) ?? "";
          if (article) spendByArticle[article] = (spendByArticle[article] ?? 0) + perProduct;
        }
      }

      results.push({
        id: camp.id, title: camp.title, state: camp.state, type: camp.advObjectType,
        budget: camp.budget ?? 0, moneySpent, views, clicks, orders, revenue, drr,
        productsCount: productIds.length,
      });
    }

    req.log.info({ campaigns: results.length, skus: Object.keys(spendByArticle).length }, "perf report done");
    res.json({ campaigns: results, spendByArticle });

  } catch (err) {
    req.log.error({ err }, "perf report error");
    res.status(502).json({ error: "Не удалось связаться с Ozon Performance API" });
  }
});

/**
 * POST /api/ozon/adv-spend-by-sku
 * Headers: X-Ozon-Client-Id, X-Ozon-Api-Key  (regular Seller API credentials)
 * Body: { dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Fetches per-SKU advertising spend from Ozon Analytics API (metric: adv_sum_all),
 * then resolves item_id → offer_id (article) via /v2/product/info/list.
 * Returns { spendByArticle: Record<string, number>, totalSpend: number, skuCount: number }
 */
router.post("/ozon/adv-spend-by-sku", async (req, res) => {
  const clientId = req.headers["x-ozon-client-id"];
  const apiKey   = req.headers["x-ozon-api-key"];

  if (!clientId || typeof clientId !== "string" || !apiKey || typeof apiKey !== "string") {
    res.status(401).json({ error: "Нужны X-Ozon-Client-Id и X-Ozon-Api-Key" });
    return;
  }

  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны dateFrom и dateTo" });
    return;
  }

  req.log.info({ dateFrom, dateTo }, "adv-spend-by-sku fetch");

  try {
    // Step 1: query Analytics API for adv_sum_all per SKU (paginated)
    const allRows: Array<{ sku: string; spend: number }> = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
      const resp = await fetch(`${OZON_BASE}/v1/analytics/data`, {
        method: "POST",
        headers: {
          "Client-Id": clientId,
          "Api-Key":   apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date_from: dateFrom,
          date_to:   dateTo,
          dimension: ["sku"],
          filters:   [],
          metrics:   ["adv_sum_all"],
          limit,
          offset,
          sort: [{ key: "adv_sum_all", order: "DESC" }],
        }),
        signal: AbortSignal.timeout(20_000),
      });

      const data = await resp.json() as {
        result?: {
          data?: Array<{
            dimensions?: Array<{ id?: string; name?: string }>;
            metrics?: number[];
          }>;
        };
        message?: string;
        code?: number;
      };

      if (!resp.ok) {
        const msg = data.message ?? `Ozon Analytics ${resp.status}`;
        req.log.warn({ status: resp.status, msg }, "adv analytics error");
        res.status(resp.status).json({ error: msg });
        return;
      }

      const rows = data.result?.data ?? [];
      for (const row of rows) {
        const sku   = String(row.dimensions?.[0]?.id ?? "");
        const spend = row.metrics?.[0] ?? 0;
        if (sku && spend > 0) allRows.push({ sku, spend });
      }

      if (rows.length < limit) break;
      offset += limit;
    }

    req.log.info({ skuWithSpend: allRows.length }, "adv analytics rows fetched");

    if (allRows.length === 0) {
      res.json({ spendByArticle: {}, totalSpend: 0, skuCount: 0 });
      return;
    }

    // Step 2: map item_id (Ozon SKU) → offer_id (seller article) in batches of 100
    const skuIds     = allRows.map(r => Number(r.sku)).filter(n => !isNaN(n));
    const skuToArticle = new Map<string, string>();

    for (let i = 0; i < skuIds.length; i += 100) {
      const batch = skuIds.slice(i, i + 100);
      try {
        const infoResp = await fetch(`${OZON_BASE}/v2/product/info/list`, {
          method: "POST",
          headers: {
            "Client-Id":   clientId,
            "Api-Key":     apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ product_id: batch }),
          signal: AbortSignal.timeout(15_000),
        });
        if (infoResp.ok) {
          const infoData = await infoResp.json() as {
            result?: { items?: Array<{ id?: number; offer_id?: string }> };
          };
          for (const item of infoData.result?.items ?? []) {
            if (item.id != null && item.offer_id) {
              skuToArticle.set(String(item.id), item.offer_id);
            }
          }
        } else {
          req.log.warn({ status: infoResp.status, batchStart: i }, "product info batch failed");
        }
      } catch (e) {
        req.log.warn({ err: e, batchStart: i }, "product info batch error");
      }
    }

    // Step 3: build spendByArticle
    const spendByArticle: Record<string, number> = {};
    let totalSpend = 0;
    let unmapped   = 0;

    for (const { sku, spend } of allRows) {
      const article = skuToArticle.get(sku);
      if (article) {
        spendByArticle[article] = (spendByArticle[article] ?? 0) + spend;
        totalSpend += spend;
      } else {
        unmapped++;
      }
    }

    req.log.info(
      { articles: Object.keys(spendByArticle).length, totalSpend: Math.round(totalSpend), unmapped },
      "adv-spend-by-sku done"
    );
    res.json({ spendByArticle, totalSpend, skuCount: Object.keys(spendByArticle).length });

  } catch (err) {
    req.log.error({ err }, "adv-spend-by-sku error");
    res.status(502).json({ error: "Ошибка подключения к Ozon API" });
  }
});

export default router;
