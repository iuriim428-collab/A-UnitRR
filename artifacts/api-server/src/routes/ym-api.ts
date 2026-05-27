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
 */
async function curlPost(
  url: string,
  authToken: string,
  body: unknown,
): Promise<unknown> {
  // Yandex Market Partner API always uses "OAuth" scheme regardless of token format.
  // Tokens may look like y0_Ag..., AQ..., or ACMA:... — all sent with OAuth prefix.
  const authScheme = "OAuth";

  const { stdout } = await execFileAsync("curl", [
    "-s",
    "--max-time", "30",
    "-X", "POST",
    "-H", `Authorization: ${authScheme} ${authToken}`,
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
 * Header: X-Ym-Token
 * Body: { campaignId: string, dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Fetches order statistics from Yandex Market Partner API with pagination.
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
          "CANCELLED_BY_USER_AFTER_CONFIRMATION",
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
      res.status(e.statusCode).json({ error: `Неверный OAuth-токен (${e.statusCode}). Нужен токен с правом market:partner-api — получите на oauth.yandex.ru (не Application Password и не IAM-токен).` });
    } else if (e.statusCode) {
      res.status(e.statusCode).json({ error: e.message });
    } else {
      res.status(502).json({ error: "Не удалось связаться с Яндекс Маркет API" });
    }
  }
});

export default router;
