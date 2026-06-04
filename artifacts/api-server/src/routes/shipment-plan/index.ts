import { Router } from "express";
import * as https from "node:https";
import * as dns from "node:dns";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function lookup4(
  hostname: string,
  opts: dns.LookupOptions,
  cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
) {
  dns.lookup(hostname, { ...opts, family: 4 }, cb as any);
}
const ymAgent = new https.Agent({ lookup: lookup4 as any });

function httpsGet(hostname: string, path: string, headers: Record<string, string>, agent?: https.Agent): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: "GET", headers: { ...headers, Host: hostname }, agent },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`JSON parse error: ${data.slice(0, 80)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function httpsPost(hostname: string, path: string, headers: Record<string, string>, body: string, agent?: https.Agent): Promise<any> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request(
      { hostname, path, method: "POST", headers: { ...headers, Host: hostname, "Content-Length": buf.length }, agent },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`JSON parse error: ${data.slice(0, 80)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Stocks (aggregated total per article per marketplace) ──────────────────

async function getWbStocks(): Promise<Map<string, { total: number; name: string; warehouses: Record<string, number> }>> {
  const yesterday = isoDate(new Date(Date.now() - 86400000));
  let data: any[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(
      `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${yesterday}`,
      { headers: { Authorization: process.env.WB_API_KEY ?? "" } }
    );
    if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
    if (!res.ok) break;
    data = await res.json();
    break;
  }
  const map = new Map<string, { total: number; name: string; warehouses: Record<string, number> }>();
  for (const s of data) {
    const article = s.supplierArticle as string;
    const qty = s.quantityFull ?? 0;
    if (!map.has(article)) map.set(article, { total: 0, name: s.subject ?? "", warehouses: {} });
    const row = map.get(article)!;
    row.total += qty;
    row.warehouses[s.warehouseName] = (row.warehouses[s.warehouseName] ?? 0) + qty;
  }
  return map;
}

async function getOzonStocks(): Promise<Map<string, { total: number; name: string; warehouses: Record<string, number> }>> {
  const headers = {
    "Client-Id": process.env.OZON_CLIENT_ID ?? "",
    "Api-Key": process.env.OZON_API_KEY ?? "",
    "Content-Type": "application/json",
  };
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const data = await httpsPost("api-seller.ozon.ru", "/v2/analytics/stock_on_warehouses", headers,
      JSON.stringify({ limit: 1000, offset }));
    const rows: any[] = data?.result?.rows ?? [];
    all = all.concat(rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  const map = new Map<string, { total: number; name: string; warehouses: Record<string, number> }>();
  for (const row of all) {
    const article = row.item_code as string;
    const qty = (row.free_to_sell_amount ?? 0) as number;
    if (!map.has(article)) map.set(article, { total: 0, name: row.item_name ?? "", warehouses: {} });
    const entry = map.get(article)!;
    entry.total += qty;
    const wh = (row.warehouse_name as string).replace(/_РФЦ$/, "").replace(/_МРФЦ$/, "").replace(/_МПСЦ$/, "").replaceAll("_", " ");
    entry.warehouses[wh] = (entry.warehouses[wh] ?? 0) + qty;
  }
  return map;
}

async function getYmStocks(): Promise<Map<string, { total: number; name: string; warehouses: Record<string, number> }>> {
  const headers = { "Api-Key": process.env.YM_OAUTH_TOKEN ?? "", "Content-Type": "application/json" };
  const offerIds: string[] = [];
  let pageToken: string | undefined;
  while (true) {
    const body: any = { limit: 200 };
    if (pageToken) body.page_token = pageToken;
    const data = await httpsPost("api.partner.market.yandex.ru", `/v2/businesses/216799890/offer-mappings`,
      headers, JSON.stringify(body), ymAgent);
    for (const m of data?.result?.offerMappings ?? []) {
      if (m.offer?.offerId) offerIds.push(m.offer.offerId);
    }
    pageToken = data?.result?.paging?.nextPageToken;
    if (!pageToken || (data?.result?.offerMappings ?? []).length === 0) break;
  }
  if (offerIds.length === 0) return new Map();

  const map = new Map<string, { total: number; name: string; warehouses: Record<string, number> }>();
  for (let i = 0; i < offerIds.length; i += 200) {
    const data = await httpsPost("api.partner.market.yandex.ru",
      `/v2/campaigns/149095778/offers/stocks`, headers,
      JSON.stringify({ offerIds: offerIds.slice(i, i + 200) }), ymAgent);
    for (const wh of data?.result?.warehouses ?? []) {
      const whName = wh.warehouseName ?? `Склад ${wh.warehouseId}`;
      for (const offer of wh.offers ?? []) {
        const article = offer.offerId as string;
        const available = offer.stocks?.find((s: any) => s.type === "AVAILABLE")?.count ?? 0;
        if (!map.has(article)) map.set(article, { total: 0, name: "", warehouses: {} });
        const entry = map.get(article)!;
        entry.total += available;
        entry.warehouses[whName] = (entry.warehouses[whName] ?? 0) + available;
      }
    }
  }
  return map;
}

// ── Sales (qty sold per article, excluding cancellations) ──────────────────

async function getWbSales(from: string, to: string): Promise<Map<string, number>> {
  const toMs = new Date(to + "T23:59:59Z").getTime();
  const fromMs = new Date(from).getTime();
  let data: any[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(
      `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${from}&flag=0`,
      { headers: { Authorization: process.env.WB_API_KEY ?? "" } }
    );
    if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
    if (!res.ok) break;
    data = await res.json();
    break;
  }
  const map = new Map<string, number>();
  for (const o of data) {
    if (o.isCancel) continue;
    const t = new Date(o.date).getTime();
    if (t < fromMs || t > toMs) continue;
    const article = o.supplierArticle as string;
    map.set(article, (map.get(article) ?? 0) + 1);
  }
  return map;
}

async function getOzonSales(from: string, to: string): Promise<Map<string, number>> {
  const headers = {
    "Client-Id": process.env.OZON_CLIENT_ID ?? "",
    "Api-Key": process.env.OZON_API_KEY ?? "",
    "Content-Type": "application/json",
  };
  const CANCELLED = new Set(["cancelled", "cancelled_waiting_for_approve"]);
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const data = await httpsPost("api-seller.ozon.ru", "/v2/posting/fbo/list", headers,
      JSON.stringify({ dir: "desc", filter: { since: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` }, limit: 100, offset }));
    const rows: any[] = data?.result ?? [];
    all = all.concat(rows);
    if (rows.length < 100) break;
    offset += 100;
  }
  const map = new Map<string, number>();
  for (const posting of all) {
    if (CANCELLED.has(posting.status)) continue;
    for (const p of posting.products ?? []) {
      const article = p.offer_id as string;
      map.set(article, (map.get(article) ?? 0) + (p.quantity ?? 1));
    }
  }
  return map;
}

async function getYmSales(from: string, to: string): Promise<Map<string, number>> {
  const headers = { "Api-Key": process.env.YM_OAUTH_TOKEN ?? "", "Content-Type": "application/json" };
  const CAMPAIGNS = [
    { id: "149095778" },
    { id: "149103486" },
  ];
  const map = new Map<string, number>();
  for (const camp of CAMPAIGNS) {
    const params = new URLSearchParams({ limit: "50", fromDate: from, toDate: to });
    const data = await httpsGet("api.partner.market.yandex.ru",
      `/v2/campaigns/${camp.id}/orders?${params}`, headers, ymAgent).catch(() => ({}));
    for (const order of data?.orders ?? []) {
      if ((order.status as string)?.toUpperCase() === "CANCELLED") continue;
      for (const item of order.items ?? []) {
        const article = item.offerId as string;
        map.set(article, (map.get(article) ?? 0) + (item.count ?? 1));
      }
    }
  }
  return map;
}

// ── Route ──────────────────────────────────────────────────────────────────

router.get("/shipment-plan", async (req, res) => {
  const periodDays = Math.max(1, Math.min(90, Number(req.query.days ?? 30)));
  const targetDays = Math.max(1, Math.min(180, Number(req.query.targetDays ?? 45)));

  const to = isoDate(new Date());
  const from = isoDate(new Date(Date.now() - periodDays * 86400000));

  // Fetch everything in parallel
  const [wbStocks, ozonStocks, ymStocks, wbSales, ozonSales, ymSales] = await Promise.all([
    getWbStocks().catch(() => new Map()),
    getOzonStocks().catch(() => new Map()),
    getYmStocks().catch(() => new Map()),
    getWbSales(from, to).catch(() => new Map()),
    getOzonSales(from, to).catch(() => new Map()),
    getYmSales(from, to).catch(() => new Map()),
  ]);

  // Collect all articles across all marketplaces
  const allArticles = new Set<string>([
    ...wbStocks.keys(), ...ozonStocks.keys(), ...ymStocks.keys(),
    ...wbSales.keys(), ...ozonSales.keys(), ...ymSales.keys(),
  ]);

  type MPKey = "wb" | "ozon" | "ym";
  type MPEntry = {
    stock: number;
    soldInPeriod: number;
    dailyVelocity: number;
    daysLeft: number;
    suggestedShipment: number;
    warehouses: Record<string, number>;
  };

  const rows: Array<{
    article: string;
    name: string;
    minDaysLeft: number;
    marketplaces: Partial<Record<MPKey, MPEntry>>;
  }> = [];

  for (const article of allArticles) {
    const mps: Partial<Record<MPKey, MPEntry>> = {};

    const sources: Array<[MPKey, Map<string, { total: number; name: string; warehouses: Record<string, number> }>, Map<string, number>]> = [
      ["wb", wbStocks, wbSales],
      ["ozon", ozonStocks, ozonSales],
      ["ym", ymStocks, ymSales],
    ];

    let name = "";

    for (const [mp, stocks, sales] of sources) {
      const stockEntry = stocks.get(article);
      const sold = sales.get(article) ?? 0;
      const stock = stockEntry?.total ?? 0;
      if (!name && stockEntry?.name) name = stockEntry.name;

      if (stock === 0 && sold === 0) continue;

      const dailyVelocity = sold / periodDays;
      const daysLeft = dailyVelocity > 0 ? stock / dailyVelocity : (stock > 0 ? 9999 : 0);
      const suggestedShipment = Math.max(0, Math.ceil(targetDays * dailyVelocity - stock));

      mps[mp] = {
        stock,
        soldInPeriod: sold,
        dailyVelocity: Math.round(dailyVelocity * 100) / 100,
        daysLeft: Math.round(daysLeft * 10) / 10,
        suggestedShipment,
        warehouses: stockEntry?.warehouses ?? {},
      };
    }

    if (Object.keys(mps).length === 0) continue;

    const daysValues = Object.values(mps).map((m) => m!.daysLeft);
    const minDaysLeft = Math.min(...daysValues);

    rows.push({ article, name, minDaysLeft, marketplaces: mps });
  }

  rows.sort((a, b) => a.minDaysLeft - b.minDaysLeft);

  res.json({ from, to, periodDays, targetDays, rows });
});

export default router;
