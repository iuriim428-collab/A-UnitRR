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

function httpsGet(
  hostname: string,
  path: string,
  headers: Record<string, string>,
  agent?: https.Agent
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: "GET", headers: { ...headers, Host: hostname }, agent },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`JSON parse: ${data.slice(0, 100)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function httpsPost(
  hostname: string,
  path: string,
  headers: Record<string, string>,
  body: string,
  agent?: https.Agent
): Promise<any> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request(
      {
        hostname, path, method: "POST",
        headers: { ...headers, Host: hostname, "Content-Length": buf.length },
        agent,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`JSON parse: ${data.slice(0, 100)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── WB ─────────────────────────────────────────────────────────────────────

async function fetchWbStocks(attempt = 0): Promise<any[]> {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const res = await fetch(
    `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${yesterday}`,
    { headers: { Authorization: process.env.WB_API_KEY ?? "" } }
  );
  if (res.status === 429) {
    if (attempt >= 3) return [];
    await sleep(3000 * (attempt + 1));
    return fetchWbStocks(attempt + 1);
  }
  if (!res.ok) return [];
  const data: any[] = await res.json();

  const byNm = new Map<
    number,
    { nmId: number; article: string; name: string; total: number; warehouses: Record<string, number> }
  >();
  for (const s of data) {
    const nm = s.nmId as number;
    if (!byNm.has(nm)) {
      byNm.set(nm, { nmId: nm, article: s.supplierArticle, name: s.subject ?? "", total: 0, warehouses: {} });
    }
    const row = byNm.get(nm)!;
    const qty = s.quantityFull ?? 0;
    row.total += qty;
    row.warehouses[s.warehouseName] = (row.warehouses[s.warehouseName] ?? 0) + qty;
  }
  return [...byNm.values()].sort((a, b) => b.total - a.total);
}

// ── Ozon ───────────────────────────────────────────────────────────────────
// Uses /v2/analytics/stock_on_warehouses for full per-warehouse breakdown

async function fetchOzonStocks(): Promise<any[]> {
  const ozonHeaders = {
    "Client-Id": process.env.OZON_CLIENT_ID ?? "",
    "Api-Key": process.env.OZON_API_KEY ?? "",
    "Content-Type": "application/json",
  };

  let all: any[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const data = await httpsPost(
      "api-seller.ozon.ru",
      "/v2/analytics/stock_on_warehouses",
      ozonHeaders,
      JSON.stringify({ limit, offset })
    );
    const rows: any[] = data?.result?.rows ?? [];
    all = all.concat(rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  // Aggregate by article across warehouses
  const byArticle = new Map<string, { article: string; name: string; total: number; warehouses: Record<string, number> }>();
  for (const row of all) {
    const article = row.item_code as string;
    const qty = (row.free_to_sell_amount ?? 0) as number;
    if (!byArticle.has(article)) {
      byArticle.set(article, { article, name: row.item_name ?? "", total: 0, warehouses: {} });
    }
    const entry = byArticle.get(article)!;
    entry.total += qty;
    entry.warehouses[row.warehouse_name] = (entry.warehouses[row.warehouse_name] ?? 0) + qty;
  }

  return [...byArticle.values()].sort((a, b) => b.total - a.total);
}

// ── YM FBY ─────────────────────────────────────────────────────────────────

const YM_BUSINESS_ID = "216799890";
const YM_FBY_CAMPAIGN = "149095778";

async function fetchYmStocks(): Promise<{ stocks: any[]; warehouseNames: Record<string, string> }> {
  const ymHeaders = {
    "Api-Key": process.env.YM_OAUTH_TOKEN ?? "",
    "Content-Type": "application/json",
  };

  // Step 1: get all offer IDs via business offer-mappings (paginate)
  const offerIds: string[] = [];
  let pageToken: string | undefined;
  while (true) {
    const body: any = { limit: 200 };
    if (pageToken) body.page_token = pageToken;
    const data = await httpsPost(
      "api.partner.market.yandex.ru",
      `/v2/businesses/${YM_BUSINESS_ID}/offer-mappings`,
      ymHeaders,
      JSON.stringify(body),
      ymAgent
    );
    const mappings: any[] = data?.result?.offerMappings ?? [];
    for (const m of mappings) {
      if (m.offer?.offerId) offerIds.push(m.offer.offerId);
    }
    pageToken = data?.result?.paging?.nextPageToken;
    if (!pageToken || mappings.length === 0) break;
  }

  if (offerIds.length === 0) return { stocks: [], warehouseNames: {} };

  // Step 2: query FBY stocks (in chunks of 200)
  const CHUNK = 200;
  const warehouseMap = new Map<string, Map<string, number>>();
  const warehouseNames: Record<string, string> = {};

  for (let i = 0; i < offerIds.length; i += CHUNK) {
    const chunk = offerIds.slice(i, i + CHUNK);
    const data = await httpsPost(
      "api.partner.market.yandex.ru",
      `/v2/campaigns/${YM_FBY_CAMPAIGN}/offers/stocks`,
      ymHeaders,
      JSON.stringify({ offerIds: chunk }),
      ymAgent
    );

    for (const wh of data?.result?.warehouses ?? []) {
      const whId = String(wh.warehouseId);
      warehouseNames[whId] = wh.warehouseName ?? `Склад ${whId}`;
      for (const offer of wh.offers ?? []) {
        const available = offer.stocks?.find((s: any) => s.type === "AVAILABLE")?.count ?? 0;
        if (!warehouseMap.has(offer.offerId)) warehouseMap.set(offer.offerId, new Map());
        warehouseMap.get(offer.offerId)!.set(whId, (warehouseMap.get(offer.offerId)!.get(whId) ?? 0) + available);
      }
    }
  }

  const stocks = Array.from(warehouseMap.entries())
    .map(([article, whMap]) => {
      const warehouses: Record<string, number> = {};
      let total = 0;
      for (const [whId, qty] of whMap) {
        warehouses[whId] = qty;
        total += qty;
      }
      return { article, warehouses, total };
    })
    .sort((a, b) => b.total - a.total);

  return { stocks, warehouseNames };
}

// ── Route ──────────────────────────────────────────────────────────────────

router.get("/stocks", async (_req, res) => {
  const [wb, ozon, ym] = await Promise.allSettled([
    fetchWbStocks(),
    fetchOzonStocks(),
    fetchYmStocks(),
  ]);

  res.json({
    wb: wb.status === "fulfilled" ? wb.value : [],
    ozon: ozon.status === "fulfilled" ? ozon.value : [],
    ym: ym.status === "fulfilled" ? ym.value.stocks : [],
    ymWarehouseNames: ym.status === "fulfilled" ? ym.value.warehouseNames : {},
  });
});

export default router;
