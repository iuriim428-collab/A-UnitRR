import { Router } from "express";
import * as https from "node:https";
import * as dns from "node:dns";

// Force IPv4: api.partner.market.yandex.ru has IPv6 that times out from Replit
function lookup4(
  hostname: string,
  opts: dns.LookupOptions,
  cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
) {
  dns.lookup(hostname, { ...opts, family: 4 }, cb as any);
}
const ymAgent = new https.Agent({ lookup: lookup4 as any });

const router = Router();
const YM_HOST = "api.partner.market.yandex.ru";

function ymHeaders() {
  return {
    "Api-Key": process.env.YM_OAUTH_TOKEN ?? "",
    "Content-Type": "application/json",
  };
}

function httpsRequest(method: string, path: string, body?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      ...ymHeaders(),
      Host: YM_HOST,
    };
    if (body) headers["Content-Length"] = String(Buffer.byteLength(body));

    const req = https.request(
      { hostname: YM_HOST, path, method, headers, agent: ymAgent },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            return reject(new Error(`YM ${method} ${path} → ${res.statusCode}: ${data}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`YM JSON parse error: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ymGet<T = any>(path: string): Promise<T> {
  return httpsRequest("GET", path) as Promise<T>;
}

async function ymPost<T = any>(path: string, body: object): Promise<T> {
  return httpsRequest("POST", path, JSON.stringify(body)) as Promise<T>;
}

// Business ID discovered via API (secret YM_BUSINESS_ID has wrong campaign ID)
const BUSINESS_ID = "216799890";
const FBY_CAMPAIGN = process.env.YM_FBY_CAMPAIGN_ID ?? "149095778";
const FBS_CAMPAIGN = process.env.YM_FBS_CAMPAIGN_ID ?? "149103486";

// Fetch all offer mappings (products)
async function fetchOffers(): Promise<Map<string, { name: string; category: string }>> {
  const map = new Map<string, { name: string; category: string }>();
  let pageToken: string | undefined;

  do {
    const body: any = { limit: 200 };
    if (pageToken) body.page_token = pageToken;
    const data = await ymPost<any>(`/v2/businesses/${BUSINESS_ID}/offer-mappings`, body);
    const items = data?.result?.offerMappings ?? [];
    for (const item of items) {
      const id = item.offer?.offerId as string;
      if (id) map.set(id, { name: item.offer?.name ?? id, category: item.offer?.category ?? "" });
    }
    pageToken = data?.result?.paging?.nextPageToken;
  } while (pageToken);

  return map;
}

// Fetch orders from a campaign
async function fetchCampaignOrders(campaignId: string, from: string, to: string): Promise<any[]> {
  const orders: any[] = [];
  let pageToken: string | undefined;

  do {
    try {
      const params = new URLSearchParams({
        limit: "50",
        fromDate: from,
        toDate: to,
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      const data = await ymGet<any>(`/v2/campaigns/${campaignId}/orders?${params}`);
      const items = data?.orders ?? [];
      orders.push(...items);
      pageToken = data?.paging?.nextPageToken;
    } catch {
      break;
    }
  } while (pageToken && orders.length < 500);

  return orders;
}

// GET /api/ym-live/products?from=2026-05-01&to=2026-05-30
router.get("/ym-live/products", async (req, res) => {
  const to = (req.query.to as string) ?? new Date().toISOString().slice(0, 10);
  const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [offers, fbyOrders, fbsOrders] = await Promise.all([
    fetchOffers(),
    fetchCampaignOrders(FBY_CAMPAIGN, from, to),
    fetchCampaignOrders(FBS_CAMPAIGN, from, to),
  ]);

  // Aggregate by offerId
  const byOffer = new Map<
    string,
    {
      offerId: string;
      name: string;
      category: string;
      orders: number;
      cancels: number;
      revenue: number;
      fby: number;
      fbs: number;
    }
  >();

  const processOrder = (order: any, type: "fby" | "fbs") => {
    for (const item of order.items ?? []) {
      const id = item.offerId as string;
      if (!id) continue;
      const info = offers.get(id);
      if (!byOffer.has(id)) {
        byOffer.set(id, {
          offerId: id,
          name: info?.name ?? id,
          category: info?.category ?? "",
          orders: 0,
          cancels: 0,
          revenue: 0,
          fby: 0,
          fbs: 0,
        });
      }
      const row = byOffer.get(id)!;
      row.orders++;
      if (type === "fby") row.fby++;
      else row.fbs++;
      const isCancelled = ["CANCELLED", "CANCELLED_IN_DELIVERY", "CANCELLED_BY_USER"].includes(order.status);
      if (isCancelled) {
        row.cancels++;
      } else {
        row.revenue += (item.prices?.buyerPrice ?? item.price ?? 0) * (item.count ?? 1);
      }
    }
  };

  fbyOrders.forEach((o) => processOrder(o, "fby"));
  fbsOrders.forEach((o) => processOrder(o, "fbs"));

  const rows = [...byOffer.values()]
    .map((r) => ({
      ...r,
      cancelRate: r.orders > 0 ? (r.cancels / r.orders) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totals = {
    orders: rows.reduce((s, r) => s + r.orders, 0),
    cancels: rows.reduce((s, r) => s + r.cancels, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    fbyOrders: fbyOrders.length,
    fbsOrders: fbsOrders.length,
  };

  res.json({ from, to, rows, totals, totalOffers: offers.size });
});

export default router;
