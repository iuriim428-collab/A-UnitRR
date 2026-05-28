import { Router, type IRouter } from "express";
import { execFile } from "child_process";
import { promisify } from "util";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const YM_BASE = "https://api.partner.market.yandex.ru";

/**
 * Runs a curl POST request and returns parsed JSON.
 * We use curl instead of Node's fetch because Yandex blocks Node.js/undici
 * TLS fingerprints from GCP IPs, while curl's TLS stack is accepted.
 *
 * Auth: uses the new Api-Key header (OAuth is deprecated as of 2024).
 * Api-Key is obtained in the seller cabinet: Настройки → Доступ по API → Создать токен.
 */
async function curlPost(
  url: string,
  apiKey: string,
  body: unknown,
): Promise<unknown> {
  const { stdout } = await execFileAsync("curl", [
    "-s",
    "--max-time", "30",
    "-X", "POST",
    "-H", `Api-Key: ${apiKey}`,
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify(body),
    "--write-out", "\n%{http_code}",
    url,
  ]);

  const lines = stdout.trim().split("\n");
  const statusCode = parseInt(lines[lines.length - 1], 10);
  const responseBody = lines.slice(0, -1).join("\n");

  if (statusCode >= 400) {
    throw Object.assign(new Error(`YM API ${statusCode}: ${responseBody}`), {
      statusCode,
      responseBody,
    });
  }

  return JSON.parse(responseBody);
}

/**
 * POST /api/ym/report
 * Header: X-Ym-Token  (Api-Key from the seller cabinet)
 * Body: { campaignId: string, dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Fetches order statistics from Yandex Market Partner API with pagination.
 */
router.post("/ym/report", async (req, res) => {
  const token = req.headers["x-ym-token"];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "Нужен заголовок X-Ym-Token (Api-Key из кабинета продавца)" });
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

  // Sanitize token: strip whitespace/newlines that break HTTP header syntax
  const cleanToken = token.trim().replace(/\s+/g, '');

  req.log.info(
    { campaignId, dateFrom, dateTo, tokenLen: cleanToken.length, tokenPrefix: cleanToken.slice(0, 8) },
    "ym api report fetch",
  );

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
      const url = `${YM_BASE}/v2/campaigns/${campaignId}/stats/orders`;

      const bodyPayload: Record<string, unknown> = {
        dateFrom: fmtDate(dateFrom),
        dateTo: fmtDate(dateTo),
        statuses: [
          "DELIVERED",
          "PICKUP",
          "CANCELLED_IN_DELIVERY",
          "RETURNED",
          "PARTIALLY_RETURNED",
        ],
      };
      if (pageToken) bodyPayload["pageToken"] = pageToken;

      const data = (await curlPost(url, cleanToken, bodyPayload)) as {
        status: string;
        result: {
          orders: unknown[];
          pager?: { nextPageToken?: string; total?: number };
        };
      };

      const orders = data.result?.orders ?? [];
      allOrders.push(...orders);

      const next = data.result?.pager?.nextPageToken;
      if (!next || orders.length === 0) break;
      pageToken = next;
    }

    req.log.info({ orders: allOrders.length }, "ym report done");
    res.json(allOrders);
  } catch (err) {
    const e = err as Error & { statusCode?: number; responseBody?: string };
    req.log.error({ err }, "ym fetch error");

    if (e.statusCode === 401 || e.statusCode === 403) {
      res.status(e.statusCode).json({
        error: `Неверный Api-Key (${e.statusCode}). Проверьте токен: Кабинет продавца → Настройки → Доступ по API → Создать токен.`,
      });
    } else if (e.statusCode) {
      res.status(e.statusCode).json({ error: e.message });
    } else {
      res.status(502).json({ error: "Не удалось связаться с Яндекс Маркет API" });
    }
  }
});

/**
 * POST /api/ym/commissions
 * Header: X-Ym-Token
 * Body: { campaignId, businessId, dateFrom, dateTo }
 *
 * Fetches billing transactions of type COMMISSION from
 * GET /v2/businesses/{businessId}/billing/transactions
 * and aggregates actual commission debits by shopSku.
 *
 * Returns: { byArticle: Record<string, number>, total: number }
 */
router.post("/ym/commissions", async (req, res) => {
  const token = req.headers["x-ym-token"];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "Нужен заголовок X-Ym-Token" });
    return;
  }
  const { campaignId, businessId, dateFrom, dateTo } = req.body as {
    campaignId?: string;
    businessId?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "Нужны параметры dateFrom и dateTo" });
    return;
  }
  if (!campaignId && !businessId) {
    res.status(400).json({ error: "Нужен campaignId или businessId" });
    return;
  }

  const cleanToken = token.trim().replace(/\s+/g, "");
  req.log.info({ campaignId, businessId, dateFrom, dateTo }, "ym commissions fetch");

  // transactions API uses ISO datetime
  const fromDt = `${dateFrom}T00:00:00+03:00`;
  const toDt   = `${dateTo}T23:59:59+03:00`;

  // commissions are per-order; we need order→items map to split by SKU
  // Step 1: fetch orders for the period (reuse existing stats/orders)
  let orderItems: Record<string, { shopSku: string; count: number; revenue: number }[]> = {};

  try {
    // fetch orders to get shopSku per orderId
    const fmtDate = (iso: string) => { const [y,m,d] = iso.split("-"); return `${d}-${m}-${y}`; };
    const cid = campaignId!;
    let pageToken: string | undefined;
    const MAX_PAGES = 200;
    for (let p = 0; p < MAX_PAGES; p++) {
      const body: Record<string, unknown> = {
        dateFrom: fmtDate(dateFrom!),
        dateTo:   fmtDate(dateTo!),
        statuses: ["DELIVERED","PICKUP","CANCELLED_IN_DELIVERY","RETURNED","PARTIALLY_RETURNED"],
      };
      if (pageToken) body["pageToken"] = pageToken;
      const url = `${YM_BASE}/v2/campaigns/${cid}/stats/orders`;
      const { stdout } = await execFileAsync("curl", [
        "-s","--max-time","30","-X","POST",
        "-H", `Api-Key: ${cleanToken}`,
        "-H","Content-Type: application/json",
        "-d", JSON.stringify(body),
        "--write-out","\n%{http_code}", url,
      ]);
      const lines = stdout.trim().split("\n");
      const sc = parseInt(lines[lines.length - 1], 10);
      const rb = lines.slice(0, -1).join("\n");
      if (sc >= 400) throw Object.assign(new Error(`YM orders ${sc}: ${rb}`), { statusCode: sc });
      const data = JSON.parse(rb) as { result: { orders: { id: number; items: { shopSku: string; count: number; prices: { type: string; total: number }[] }[] }[]; pager?: { nextPageToken?: string } } };
      for (const o of data.result?.orders ?? []) {
        const totalRev = (o.items ?? []).reduce((s, it) => {
          const mp = it.prices?.find(p => p.type === "MARKETPLACE");
          return s + (mp?.total ?? 0);
        }, 0);
        orderItems[String(o.id)] = (o.items ?? []).map(it => {
          const mp = it.prices?.find(p => p.type === "MARKETPLACE");
          return { shopSku: it.shopSku, count: it.count, revenue: mp?.total ?? 0 };
        });
        // store total for proportional split
        (orderItems as Record<string, { shopSku: string; count: number; revenue: number; _total?: number }[]>)[String(o.id)]._total = totalRev as unknown as number;
      }
      const next = data.result?.pager?.nextPageToken;
      if (!next || (data.result?.orders ?? []).length === 0) break;
      pageToken = next;
    }
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    req.log.error({ err }, "ym commissions: orders fetch failed");
    res.status(e.statusCode ?? 502).json({ error: `Не удалось загрузить заказы: ${e.message}` });
    return;
  }

  // Step 2: fetch billing transactions via campaign-level endpoint
  const byArticle: Record<string, number> = {};
  let total = 0;

  try {
    const cid = campaignId!;
    let nextPageToken: string | undefined;
    let debugLogged = false;
    const MAX_TX_PAGES = 500;
    // Commission-related operation types in YM billing API
    const COMMISSION_TYPES = new Set([
      "AGENCY_COMMISSION",
      "MARKETPLACE_OFFER_PROCESSING_FEE",
      "MARKETPLACE_OFFER_FULFILLMENT_FEE",
      "MARKETPLACE_SELLERS_INBOUND_REAL_SUPPLIER_ARTICLE_PRICE",
      "COMMISSION",
      "MARKET_COMMISSION",
    ]);

    for (let p = 0; p < MAX_TX_PAGES; p++) {
      const params = new URLSearchParams({
        fromDate: dateFrom!,
        toDate:   dateTo!,
        limit: "200",
      });
      if (nextPageToken) params.set("pageToken", nextPageToken);
      const url = `${YM_BASE}/v2/campaigns/${cid}/billing/transactions?${params}`;
      const { stdout } = await execFileAsync("curl", [
        "-s","--max-time","30",
        "-H", `Api-Key: ${cleanToken}`,
        "--write-out","\n%{http_code}", url,
      ]);
      const lines = stdout.trim().split("\n");
      const sc = parseInt(lines[lines.length - 1], 10);
      const rb = lines.slice(0, -1).join("\n");
      if (sc >= 400) {
        req.log.warn({ sc, rb }, "ym billing transactions error");
        break;
      }
      const data = JSON.parse(rb) as {
        result?: {
          operations?: {
            type: string;
            amount: number;
            orderId?: number;
          }[];
          pager?: { nextPageToken?: string };
        };
      };
      const ops = data.result?.operations ?? [];

      // Log first page sample to understand available operation types
      if (!debugLogged && ops.length > 0) {
        debugLogged = true;
        const sample = ops.slice(0, 5).map(o => ({ type: o.type, amount: o.amount, orderId: o.orderId }));
        const typeCounts: Record<string, number> = {};
        for (const o of ops) typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1;
        req.log.info({ sample, typeCounts, totalOps: ops.length }, "ym billing sample");
      }

      for (const op of ops) {
        if (!COMMISSION_TYPES.has(op.type)) continue;
        const amt = Math.abs(op.amount ?? 0);
        if (amt === 0) continue;
        total += amt;

        // Distribute by revenue share across items in this order
        const oid = String(op.orderId ?? "");
        const items = orderItems[oid];
        if (!items || items.length === 0) {
          byArticle["_unknown"] = (byArticle["_unknown"] ?? 0) + amt;
          continue;
        }
        const orderRev = items.reduce((s, it) => s + it.revenue, 0);
        for (const it of items) {
          const share = orderRev > 0 ? it.revenue / orderRev : 1 / items.length;
          byArticle[it.shopSku] = (byArticle[it.shopSku] ?? 0) + amt * share;
        }
      }

      const next = data.result?.pager?.nextPageToken;
      if (!next || ops.length === 0) break;
      nextPageToken = next;
    }

    delete byArticle["_unknown"];
    req.log.info({ total, skuCount: Object.keys(byArticle).length }, "ym commissions done");
    res.json({ byArticle, total });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    req.log.error({ err }, "ym commissions: billing fetch failed");
    res.status(e.statusCode ?? 502).json({ error: `Не удалось загрузить транзакции: ${e.message}` });
  }
});

export default router;
