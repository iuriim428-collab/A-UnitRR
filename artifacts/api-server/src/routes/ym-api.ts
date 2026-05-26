import { Router, type IRouter } from "express";

const router: IRouter = Router();
const YM_BASE = "https://api.partner.market.yandex.ru";

/**
 * POST /api/ym/report
 * Header: X-Ym-Token
 * Body: { campaignId: string, dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Fetches order statistics from Yandex Market Partner API with pagination.
 * Returns both delivered orders (sales) and returned/cancelled orders.
 */
router.post("/ym/report", async (req, res) => {
  const token = req.headers["x-ym-token"];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "Нужен заголовок X-Ym-Token (OAuth-токен)" });
    return;
  }

  const { campaignId, dateFrom, dateTo } = req.body as {
    campaignId?: string;
    dateFrom?: string;
    dateTo?: string;
  };

  if (!campaignId || !dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны параметры campaignId, dateFrom и dateTo" });
    return;
  }

  req.log.info({ campaignId, dateFrom, dateTo }, "ym api report fetch");

  // Convert YYYY-MM-DD to DD-MM-YYYY which YM API expects
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  };

  const allOrders: unknown[] = [];
  let pageToken: string | undefined;
  const MAX_PAGES = 200;
  let pageNum = 0;

  try {
    while (pageNum < MAX_PAGES) {
      pageNum++;
      const url = new URL(
        `${YM_BASE}/v2/campaigns/${campaignId}/stats/orders`
      );

      const bodyPayload: Record<string, unknown> = {
        dateFrom: fmtDate(dateFrom),
        dateTo: fmtDate(dateTo),
        statuses: [
          "DELIVERED",
          "PICKUP",
          "CANCELLED_IN_DELIVERY",
          "RETURNED",
          "CANCELLED_BY_USER_AFTER_CONFIRMATION",
          "PARTIALLY_RETURNED",
        ],
      };
      if (pageToken) bodyPayload["pageToken"] = pageToken;

      const upstream = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => String(upstream.status));
        req.log.warn({ status: upstream.status, text }, "ym api error");
        res.status(upstream.status).json({ error: text });
        return;
      }

      const body = (await upstream.json()) as {
        status: string;
        result: {
          orders: unknown[];
          pager?: { nextPageToken?: string; total?: number };
        };
      };

      const orders = body.result?.orders ?? [];
      allOrders.push(...orders);

      const next = body.result?.pager?.nextPageToken;
      if (!next || orders.length === 0) break;
      pageToken = next;
    }

    req.log.info({ orders: allOrders.length }, "ym report done");
    res.json(allOrders);
  } catch (err) {
    req.log.error({ err }, "ym fetch error");
    res.status(502).json({ error: "Не удалось связаться с Яндекс Маркет API" });
  }
});

export default router;
