import { Router, type IRouter } from "express";

const router: IRouter = Router();

const WB_STAT_BASE     = "https://statistics-api.wildberries.ru";
const WB_ANALYTICS_BASE = "https://seller-analytics.wildberries.ru";
const WB_ADVERT_BASE   = "https://advert-api.wildberries.ru";

const WB_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ru-RU,ru;q=0.9",
  "Origin": "https://seller.wildberries.ru",
  "Referer": "https://seller.wildberries.ru/",
};

// ─── Statistics report ────────────────────────────────────────────────────────
/**
 * GET /api/wb/report?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 * Header: X-WB-Token
 */
router.get("/wb/report", async (req, res) => {
  const token = req.headers["x-wb-token"];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "Заголовок X-WB-Token не указан" });
    return;
  }

  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны параметры dateFrom и dateTo (YYYY-MM-DD)" });
    return;
  }

  req.log.info({ dateFrom, dateTo }, "wb report fetch");

  const allRows: unknown[] = [];
  let rrdid = 0;

  try {
    while (true) {
      const url =
        `${WB_STAT_BASE}/api/v5/supplier/reportDetailByPeriod` +
        `?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100000&rrdid=${rrdid}`;

      const upstream = await fetch(url, {
        headers: { ...WB_HEADERS, Authorization: token },
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstream.ok) {
        const body = await upstream.text().catch(() => "");
        req.log.warn({ status: upstream.status, body }, "wb api error");
        if (upstream.status === 429) {
          const isIpBlock = body.includes("s2s-api-auth-stat") || body.includes("dev.wildberries.ru");
          if (isIpBlock) {
            res.status(429).json({
              error: "WB заблокировал запрос с облачного сервера (IP не разрешён). " +
                "Решение: запустите локальный прокси на своём компьютере командой " +
                "«node local-wb-proxy.mjs» — тогда запросы пойдут с вашего IP. " +
                "Статус прокси отображается в строке под токеном (🟢/🔴). " +
                "Если прокси уже запущен и ошибка остаётся — пересоздайте токен на dev.wildberries.ru (раздел API-ключи → Статистика).",
            });
            return;
          }
          res.status(429).json({ error: "Превышен лимит запросов WB API. Подождите 1 минуту и повторите." });
          return;
        }
        if (upstream.status === 401 || upstream.status === 403) {
          res.status(upstream.status).json({ error: `Неверный API-токен WB (${upstream.status}). Ответ: ${body || "(пустой)"}` });
          return;
        }
        res.status(upstream.status).json({ error: `Ошибка WB API (${upstream.status}): ${body || upstream.statusText}` });
        return;
      }

      const page = (await upstream.json()) as unknown[];
      if (!Array.isArray(page) || page.length === 0) break;

      allRows.push(...page);

      const last = page[page.length - 1] as Record<string, unknown>;
      rrdid = Number(last["rrd_id"] ?? 0);

      if (page.length < 100_000) break;
    }

    req.log.info({ rows: allRows.length }, "wb report done");
    res.json(allRows);
  } catch (err) {
    req.log.error({ err }, "wb fetch error");
    res.status(502).json({ error: "Не удалось связаться с WB API" });
  }
});

// ─── Analytics (seller-analytics.wildberries.ru) ─────────────────────────────
/**
 * GET /api/wb/analytics?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 * Header: X-WB-Analytics-Token
 *
 * Returns array of nm-report cards with views, add-to-cart, conversion, buyout % per SKU.
 * Endpoint: /api/v2/nm-report/detail (seller-analytics.wildberries.ru)
 */
router.get("/wb/analytics", async (req, res) => {
  const token = req.headers["x-wb-analytics-token"];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "Нужен заголовок X-WB-Analytics-Token" });
    return;
  }

  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны dateFrom и dateTo" });
    return;
  }

  const begin = `${dateFrom} 00:00:00`;
  const end   = `${dateTo} 23:59:59`;

  req.log.info({ dateFrom, dateTo }, "wb analytics fetch");

  const allCards: unknown[] = [];
  let page = 1;

  try {
    while (page <= 50) {
      const params = new URLSearchParams({
        "period.begin": begin,
        "period.end": end,
        "page": String(page),
        "timezone": "Europe/Moscow",
      });
      const url = `${WB_ANALYTICS_BASE}/api/v2/nm-report/detail?${params}`;

      const resp = await fetch(url, {
        headers: { ...WB_HEADERS, Authorization: token },
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        req.log.warn({ status: resp.status, body }, "wb analytics api error");
        res.status(resp.status).json({
          error: `WB Analytics ${resp.status}: ${body || resp.statusText}. ` +
            "Убедитесь, что токен имеет право «Аналитика» (dev.wildberries.ru → API-ключи).",
        });
        return;
      }

      const data = (await resp.json()) as {
        data?: { cards?: unknown[]; isNextPage?: boolean };
      };

      const cards = data?.data?.cards ?? [];
      allCards.push(...cards);

      if (!data?.data?.isNextPage || cards.length === 0) break;
      page++;
    }

    req.log.info({ cards: allCards.length }, "wb analytics done");
    res.json(allCards);
  } catch (err) {
    req.log.error({ err }, "wb analytics fetch error");
    res.status(502).json({ error: "Не удалось получить данные WB Analytics" });
  }
});

// ─── Advertising spend (advert-api.wildberries.ru) ───────────────────────────
/**
 * GET /api/wb/advert?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 * Header: X-WB-Advert-Token
 *
 * Returns [{nmId, spend}] — aggregated ad spend per nm_id across all campaigns.
 * Flow:
 *   1. Fetch active (9) + paused (11) + ready (4) campaigns
 *   2. POST /adv/v2/fullstat with campaign IDs (up to 100 at a time)
 *   3. Filter days by [dateFrom, dateTo], sum spend per nm_id
 */
router.get("/wb/advert", async (req, res) => {
  const token = req.headers["x-wb-advert-token"];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "Нужен заголовок X-WB-Advert-Token" });
    return;
  }

  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны dateFrom и dateTo" });
    return;
  }

  req.log.info({ dateFrom, dateTo }, "wb advert fetch");

  try {
    // Step 1: collect campaign IDs across relevant statuses
    const campaignIds: number[] = [];
    for (const status of [9, 11, 4]) {
      let offset = 0;
      while (offset <= 2000) {
        const url = `${WB_ADVERT_BASE}/adv/v2/promotion/adverts?status=${status}&limit=100&offset=${offset}`;
        const resp = await fetch(url, {
          headers: { ...WB_HEADERS, Authorization: token },
          signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) break;

        const list = (await resp.json()) as Array<{ advertId?: number }> | null;
        if (!Array.isArray(list) || list.length === 0) break;

        for (const c of list) {
          if (c.advertId) campaignIds.push(c.advertId);
        }
        if (list.length < 100) break;
        offset += 100;
      }
    }

    req.log.info({ campaignCount: campaignIds.length }, "wb advert campaigns fetched");

    if (campaignIds.length === 0) {
      res.json([]);
      return;
    }

    // Deduplicate
    const uniqueIds = [...new Set(campaignIds)];

    // Step 2: get fullstat in batches of 100
    const dfrom = new Date(dateFrom as string);
    const dto   = new Date(dateTo as string);
    const nmSpend: Record<number, number> = {};

    for (let i = 0; i < uniqueIds.length; i += 100) {
      const batch = uniqueIds.slice(i, i + 100);
      const resp = await fetch(`${WB_ADVERT_BASE}/adv/v2/fullstat`, {
        method: "POST",
        headers: { ...WB_HEADERS, Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);

      if (!resp || !resp.ok) continue;

      const stats = (await resp.json().catch(() => [])) as Array<{
        advertId?: number;
        days?: Array<{
          date?: string;
          apps?: Array<{
            appType?: number;
            nm?: Array<{ nmId?: number; sum?: number }>;
          }>;
        }>;
      }>;

      if (!Array.isArray(stats)) continue;

      for (const campaign of stats) {
        for (const day of (campaign.days ?? [])) {
          if (!day.date) continue;
          const dayDate = new Date(day.date);
          if (dayDate < dfrom || dayDate > dto) continue;

          for (const app of (day.apps ?? [])) {
            for (const nm of (app.nm ?? [])) {
              if (!nm.nmId) continue;
              nmSpend[nm.nmId] = (nmSpend[nm.nmId] ?? 0) + (nm.sum ?? 0);
            }
          }
        }
      }
    }

    const result = Object.entries(nmSpend)
      .map(([nmId, spend]) => ({ nmId: Number(nmId), spend }))
      .filter(x => x.spend > 0);

    req.log.info({ nmCount: result.length }, "wb advert done");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "wb advert fetch error");
    res.status(502).json({ error: "Не удалось получить данные рекламы WB" });
  }
});

export default router;
