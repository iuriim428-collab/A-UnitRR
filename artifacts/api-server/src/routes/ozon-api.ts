import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

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
 * Returns { jobId } immediately. The actual work runs in the background.
 *
 * GET /api/ozon/performance-report/job/:jobId
 * Returns { status: 'running'|'done'|'error', progress, result?, error? }
 */
const PERF_BASE = "https://api-performance.ozon.ru";

interface PerfJobResult {
  campaigns: Array<{
    id: string; title: string; state: string; type: string;
    budget: number; moneySpent: number; views: number; clicks: number;
    orders: number; revenue: number; drr: number; productsCount: number;
  }>;
  spendByArticle: Record<string, number>;
}

interface PerfJob {
  status: "running" | "done" | "error";
  progress: string;
  result?: PerfJobResult;
  error?: string;
  createdAt: number;
}

const perfJobs = new Map<string, PerfJob>();

// Expire jobs older than 15 minutes
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of perfJobs) {
    if (job.createdAt < cutoff) perfJobs.delete(id);
  }
}, 60_000).unref();

async function runPerfJob(
  jobId: string,
  perfClientId: string,
  perfClientSecret: string,
  sellerClientId: string | undefined,
  sellerApiKey: string | undefined,
  dateFrom: string,
  dateTo: string,
) {
  const job = perfJobs.get(jobId)!;
  const log = logger.child({ jobId });
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  try {
    // 1. OAuth token
    job.progress = "Авторизация в Performance API…";
    const tokenResp = await fetch(`${PERF_BASE}/api/client/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ client_id: perfClientId, client_secret: perfClientSecret, grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenData = await tokenResp.json() as { access_token?: string; error_description?: string; message?: string };
    if (!tokenResp.ok) {
      const msg = tokenData.error_description ?? tokenData.message ?? `Ошибка авторизации (${tokenResp.status})`;
      job.status = "error"; job.error = `Performance API: ${msg}`; return;
    }
    const auth = `Bearer ${tokenData.access_token}`;

    // 2. All campaigns
    job.progress = "Загрузка списка кампаний…";
    const campResp = await fetch(`${PERF_BASE}/api/client/campaign`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const campData = await campResp.json() as { list?: PerfCampaignRaw[] };
    const campaigns: PerfCampaignRaw[] = campData.list ?? [];
    log.info({ total: campaigns.length }, "perf campaigns loaded");

    if (campaigns.length === 0) {
      job.status = "done"; job.result = { campaigns: [], spendByArticle: {} }; return;
    }

    // 3. Statistics — send ALL campaigns in one request to avoid 429 "max 1 active task"
    const campIdsInt = campaigns.map(c => Number(c.id)).filter(n => !isNaN(n));
    const statsMap   = new Map<string, PerfStatRaw>();
    const reportSpend: Record<string, number> = {};

    // Try single batch; if Ozon rejects it (400 = too many), fall back to chunks of 10
    const batches: number[][] = campIdsInt.length > 0 ? [campIdsInt] : [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const chunk = batches[batchIdx];
      try {
        job.progress = batches.length === 1
          ? `Запрос статистики по ${chunk.length} кампаниям…`
          : `Статистика: чанк ${batchIdx + 1}/${batches.length}…`;

        // Step A: create stats task; retry on 429 (Ozon allows only 1 active task)
        let createResp!: Response;
        let createData: { UUID?: string; error?: string } = {};
        let created = false;
        for (let retry = 0; retry < 12; retry++) {
          if (retry > 0) {
            const wait = retry <= 5 ? 8_000 : 15_000;
            job.progress = `Ожидание очереди Ozon (попытка ${retry}/12)…`;
            log.info({ retry, wait, campCount: chunk.length }, "perf stats 429 retry");
            await sleep(wait);
          }
          createResp = await fetch(`${PERF_BASE}/api/client/statistics/json`, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/json" },
            body: JSON.stringify({ campaigns: chunk, dateFrom, dateTo, groupBy: "NO_GROUP_BY" }),
            signal: AbortSignal.timeout(15_000),
          });
          createData = await createResp.json() as { UUID?: string; error?: string };
          if (createResp.ok && createData.UUID) { created = true; break; }
          if (createResp.status === 429) continue;
          // 400 = too many campaigns in one batch → fall back to chunks of 10
          if (createResp.status === 400 && batchIdx === 0 && campIdsInt.length > 10) {
            log.warn({ campCount: chunk.length }, "perf stats single batch rejected, chunking");
            for (let i = 0; i < campIdsInt.length; i += 10) batches.push(campIdsInt.slice(i, i + 10));
          }
          log.warn({ status: createResp.status, body: JSON.stringify(createData).slice(0, 200) }, "perf stats create failed");
          break;
        }
        if (!created || !createData.UUID) {
          log.warn({ status: createResp?.status }, "perf stats create gave up");
          if (createResp?.status === 429) {
            job.status = "error";
            job.error = "Ozon уже обрабатывает другой запрос статистики. Подождите 2–3 минуты и попробуйте снова.";
            return;
          }
          continue;
        }
        const uuid = createData.UUID;
        log.info({ uuid, campCount: chunk.length }, "perf stats task created");

        // Step B: poll until ready (max 120 s — Ozon queue can be slow)
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          await sleep(2_000);
          job.progress = `Ozon формирует отчёт… (${attempt * 2}с)`;
          const pollResp = await fetch(`${PERF_BASE}/api/client/statistics/${uuid}`, {
            headers: { Authorization: auth },
            signal: AbortSignal.timeout(10_000),
          });
          const pollData = await pollResp.json() as Record<string, unknown>;
          const pollState = String(pollData.state ?? "");
          const isReady = pollState === "OK" || pollState === "DONE" || pollState === "READY";
          log.info({ uuid, attempt, state: pollState }, "perf stats poll");
          if (isReady) {
            type StatEntry = Record<string, unknown>;
            let entries: StatEntry[] = [];
            const reportLink = String(pollData.link ?? "");
            if (reportLink) {
              try {
                const reportUrl = reportLink.startsWith("http") ? reportLink : `${PERF_BASE}${reportLink}`;
                const reportResp = await fetch(reportUrl, { headers: { Authorization: auth }, signal: AbortSignal.timeout(15_000) });
                const reportText = await reportResp.text();
                log.info({ uuid, status: reportResp.status, preview: reportText.slice(0, 500) }, "perf report fetched");
                try {
                  const reportData = JSON.parse(reportText) as Record<string, unknown>;
                  if (Array.isArray(reportData)) {
                    entries = reportData as StatEntry[];
                  } else {
                    type ReportRow = { sku?: string; moneySpent?: string; views?: string; clicks?: string; orders?: string; ordersMoney?: string; };
                    type CampReport = { title?: string; report?: { rows?: ReportRow[] } };
                    const parseRu = (s?: string) => parseFloat((s ?? "0").replace(",", ".")) || 0;
                    for (const [campId, campVal] of Object.entries(reportData)) {
                      const camp = campVal as CampReport;
                      const rows = camp?.report?.rows;
                      if (!Array.isArray(rows)) continue;
                      let totalSpent = 0, totalViews = 0, totalClicks = 0, totalOrders = 0, totalRevenue = 0;
                      for (const row of rows) {
                        const spent = parseRu(row.moneySpent);
                        const sku   = String(row.sku ?? "").trim();
                        totalSpent   += spent;
                        totalViews   += parseInt(row.views   ?? "0") || 0;
                        totalClicks  += parseInt(row.clicks  ?? "0") || 0;
                        totalOrders  += parseInt(row.orders  ?? "0") || 0;
                        totalRevenue += parseRu(row.ordersMoney);
                        if (sku) reportSpend[sku] = (reportSpend[sku] ?? 0) + spent;
                      }
                      statsMap.set(campId, { id: campId, moneySpent: totalSpent, views: totalViews, clicks: totalClicks, orders: totalOrders, revenue: totalRevenue } as unknown as PerfStatRaw);
                    }
                  }
                } catch { log.info({ uuid }, "perf report not JSON"); }
              } catch (e) { log.warn({ uuid, err: e }, "perf report fetch error"); }
            } else {
              const raw = pollData as { statistics?: StatEntry[] | { sku?: StatEntry[]; banner?: StatEntry[] }; list?: StatEntry[]; result?: StatEntry[]; rows?: StatEntry[]; data?: StatEntry[] };
              if (Array.isArray(raw.statistics)) entries = raw.statistics;
              else if (raw.statistics && typeof raw.statistics === "object") { const n = raw.statistics as { sku?: StatEntry[]; banner?: StatEntry[] }; entries = [...(n.sku ?? []), ...(n.banner ?? [])]; }
              else if (Array.isArray(raw.list))   entries = raw.list;
              else if (Array.isArray(raw.result)) entries = raw.result;
              else if (Array.isArray(raw.rows))   entries = raw.rows;
              else if (Array.isArray(raw.data))   entries = raw.data;
            }
            for (const s of entries) { const sid = String((s as unknown as PerfStatRaw).id ?? ""); if (sid) statsMap.set(sid, s as unknown as PerfStatRaw); }
            ready = true; break;
          }
          if (pollData.state === "ERROR" || pollData.error) { log.warn({ uuid }, "perf stats task error"); break; }
        }
        if (!ready) log.warn({ uuid }, "perf stats task timed out");
      } catch (e) { log.warn({ err: e }, "perf stats batch error"); }
    }
    log.info({ statsEntries: statsMap.size }, "perf stats done");

    // 4. Fetch objects for campaigns with actual spend
    const campProducts       = new Map<string, string[]>();
    const allItemIds         = new Set<string>();
    const productIdToArticle = new Map<string, string>();

    const campaignsWithSpend = campaigns.filter(c => {
      const s = statsMap.get(c.id);
      return s !== undefined && (parseFloat(String(s.moneySpent ?? 0)) || 0) > 0;
    });
    log.info({ withSpend: campaignsWithSpend.length, total: campaigns.length }, "perf campaigns with spend");
    job.progress = `Загрузка состава ${campaignsWithSpend.length} кампаний…`;

    for (const camp of campaignsWithSpend) {
      try {
        const objResp = await fetch(`${PERF_BASE}/api/client/campaign/${camp.id}/objects`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(10_000) });
        if (objResp.ok) {
          const objRaw = await objResp.json() as { list?: Array<Record<string, unknown>> };
          const ids: string[] = [];
          for (const p of objRaw.list ?? []) {
            const id      = String(p.id      ?? "").trim();
            const article = String(p.article ?? p.offer_id ?? p.offerId ?? "").trim();
            if (id) {
              ids.push(id);
              if (article) productIdToArticle.set(id, article);
              else if (!isNaN(Number(id))) allItemIds.add(id);
            } else if (article) {
              ids.push(article); productIdToArticle.set(article, article);
            }
          }
          campProducts.set(camp.id, ids);
        }
      } catch { /* skip */ }
    }

    // 5. Resolve item_ids → offer_ids via Seller API
    if (sellerClientId && sellerApiKey && allItemIds.size > 0) {
      const ids = Array.from(allItemIds).map(Number).filter(n => !isNaN(n));
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        try {
          let infoResp = await fetch(`${OZON_BASE}/v2/product/info/list`, { method: "POST", headers: { "Client-Id": sellerClientId, "Api-Key": sellerApiKey, "Content-Type": "application/json" }, body: JSON.stringify({ sku: batch }), signal: AbortSignal.timeout(15_000) });
          if (!infoResp.ok) infoResp = await fetch(`${OZON_BASE}/v2/product/info/list`, { method: "POST", headers: { "Client-Id": sellerClientId, "Api-Key": sellerApiKey, "Content-Type": "application/json" }, body: JSON.stringify({ product_id: batch }), signal: AbortSignal.timeout(15_000) });
          if (infoResp.ok) {
            const infoData = await infoResp.json() as { result?: { items?: Array<{ id?: number; sku?: number; offer_id?: string }> } };
            for (const item of infoData.result?.items ?? []) { const k = String(item.id ?? item.sku ?? ""); if (k && item.offer_id) productIdToArticle.set(k, item.offer_id); }
          }
        } catch { /* skip */ }
      }
    }

    // 6. Build results
    const spendByArticle: Record<string, number> = Object.keys(reportSpend).length > 0
      ? { ...reportSpend }
      : (() => {
          const fb: Record<string, number> = {};
          for (const camp of campaignsWithSpend) {
            const s = statsMap.get(camp.id);
            const spent = parseFloat(String(s?.moneySpent ?? 0)) || 0;
            const pids  = campProducts.get(camp.id) ?? [];
            if (spent > 0 && pids.length > 0) {
              const pp = spent / pids.length;
              for (const pid of pids) { const k = productIdToArticle.get(pid) ?? pid; fb[k] = (fb[k] ?? 0) + pp; }
            }
          }
          return fb;
        })();

    const results = campaignsWithSpend.map(camp => {
      const s = statsMap.get(camp.id);
      const moneySpent = parseFloat(String(s?.moneySpent ?? 0)) || 0;
      const revenue    = parseFloat(String(s?.revenue    ?? 0)) || 0;
      return {
        id: camp.id, title: camp.title, state: camp.state, type: camp.advObjectType,
        budget: camp.budget ?? 0, moneySpent,
        views:  (s?.views  as number) ?? 0, clicks: (s?.clicks as number) ?? 0,
        orders: (s?.orders as number) ?? 0, revenue,
        drr: revenue > 0 ? (moneySpent / revenue) * 100 : 0,
        productsCount: (campProducts.get(camp.id) ?? []).length,
      };
    });

    log.info({ campaigns: results.length, skus: Object.keys(spendByArticle).length, totalSpend: Object.values(spendByArticle).reduce((a, b) => a + b, 0).toFixed(2) }, "perf report done");
    job.status = "done"; job.result = { campaigns: results, spendByArticle };
  } catch (err) {
    log.error({ err }, "perf job error");
    job.status = "error"; job.error = "Не удалось связаться с Ozon Performance API";
  }
}

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

// GET /api/ozon/performance-report/job/:jobId — poll background job status
router.get("/ozon/performance-report/job/:jobId", (req, res) => {
  const job = perfJobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "Job not found or expired" }); return; }
  res.json({
    status:   job.status,
    progress: job.progress,
    result:   job.result,
    error:    job.error,
  });
});

router.post("/ozon/performance-report", async (req, res) => {
  const perfClientId     = req.headers["x-perf-client-id"];
  const perfClientSecret = req.headers["x-perf-client-secret"];
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

  // Start background job and return jobId immediately (avoids 120s proxy timeout)
  const jobId = randomUUID();
  perfJobs.set(jobId, { status: "running", progress: "Запуск…", createdAt: Date.now() });
  req.log.info({ dateFrom, dateTo, jobId }, "perf job started");
  res.json({ jobId });

  runPerfJob(
    jobId,
    String(perfClientId), String(perfClientSecret),
    sellerClientId ? String(sellerClientId) : undefined,
    sellerApiKey   ? String(sellerApiKey)   : undefined,
    dateFrom, dateTo,
  ).catch(err => {
    const job = perfJobs.get(jobId);
    if (job) { job.status = "error"; job.error = String(err); }
  });
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
