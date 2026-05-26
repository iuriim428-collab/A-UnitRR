import { Router, type IRouter } from "express";

const router: IRouter = Router();

const WB_BASE = "https://statistics-api.wildberries.ru";

/**
 * GET /api/wb/report?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 * Header: X-WB-Token: <Wildberries API token>
 *
 * Fetches all pages from WB reportDetailByPeriod (rrdid-based pagination)
 * and returns the concatenated rows as JSON.
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
        `${WB_BASE}/api/v5/supplier/reportDetailByPeriod` +
        `?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100000&rrdid=${rrdid}`;

      const upstream = await fetch(url, {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstream.ok) {
        req.log.warn({ status: upstream.status }, "wb api error");
        if (upstream.status === 429) {
          res.status(429).json({ error: "Превышен лимит запросов WB API. Подождите 1 минуту и повторите." });
          return;
        }
        if (upstream.status === 401 || upstream.status === 403) {
          res.status(upstream.status).json({ error: "Неверный или просроченный API-токен WB. Проверьте токен в настройках продавца." });
          return;
        }
        const text = await upstream.text().catch(() => `HTTP ${upstream.status}`);
        res.status(upstream.status).json({ error: `Ошибка WB API (${upstream.status}): ${text}` });
        return;
      }

      const page = (await upstream.json()) as unknown[];
      if (!Array.isArray(page) || page.length === 0) break;

      allRows.push(...page);

      // rrdid is the cursor; last element contains the next page starting id
      const last = page[page.length - 1] as Record<string, unknown>;
      rrdid = Number(last["rrd_id"] ?? 0);

      if (page.length < 100_000) break; // final page
    }

    req.log.info({ rows: allRows.length }, "wb report done");
    res.json(allRows);
  } catch (err) {
    req.log.error({ err }, "wb fetch error");
    res.status(502).json({ error: "Не удалось связаться с WB API" });
  }
});

export default router;
