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
    // Log one sale-type operation and one service-type for parser debugging
    const saleOp = allOps.find((o: any) =>
      /delivered|accrual|agent/i.test(o.operation_type ?? '')
    ) ?? allOps.find((o: any) => (o.amount ?? 0) > 0 && (o.items?.length ?? 0) > 0);
    if (saleOp) req.log.info({ saleOp }, "ozon sample SALE operation");
    if (allOps[0]) req.log.info({ first: allOps[0] }, "ozon first operation");
    res.json(allOps);
  } catch (err) {
    req.log.error({ err }, "ozon fetch error");
    res.status(502).json({ error: "Не удалось связаться с Ozon API" });
  }
});

export default router;
