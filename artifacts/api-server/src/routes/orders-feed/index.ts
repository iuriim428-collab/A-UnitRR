import { Router } from "express";
import * as https from "node:https";
import * as dns from "node:dns";
import { getWbStatToken, getOzonHeaders, getYmToken, getYmCampaignIds } from "../../lib/settings.js";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Force IPv4 for YM (IPv6 times out from Replit)
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
          catch { reject(new Error(`JSON parse: ${data.slice(0, 100)}`)); }
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

// WB date format: "2026-05-30T12:34:56" (Moscow time UTC+3, no offset suffix)
// Must append +03:00 so the browser doesn't misinterpret as local/UTC
function parseWbDate(s: string): string {
  if (!s) return new Date().toISOString();
  // Already has offset info — return as-is
  if (s.includes("+") || s.endsWith("Z")) return s;
  return `${s}+03:00`;
}

// ── WB ───────────────────────────────────────────────────────────────────────

async function fetchWbOrders(from: string, to: string) {
  const toMs = new Date(to + "T23:59:59Z").getTime();
  const fromMs = new Date(from).getTime();

  const wbHeaders = { Authorization: await getWbStatToken() };
  const data = await httpsGet(
    "statistics-api.wildberries.ru",
    `/api/v1/supplier/orders?dateFrom=${from}&flag=0`,
    wbHeaders
  );

  const rows = (Array.isArray(data) ? data : [])
    .filter((o: any) => {
      const t = new Date(o.date).getTime();
      return t >= fromMs && t <= toMs;
    })
    .map((o: any) => ({
      id: o.srid ?? o.gNumber,
      marketplace: "wb" as const,
      time: parseWbDate(o.date),
      article: o.supplierArticle,
      name: o.subject,
      price: o.priceWithDisc ?? 0,
      qty: 1,
      status: o.isCancel ? "cancel" : "new",
      region: o.regionName ?? "",
      warehouse: o.warehouseName ?? "",
    }));

  return rows;
}

// ── Ozon ─────────────────────────────────────────────────────────────────────

async function fetchOzonOrders(from: string, to: string) {
  const ozonHeaders = {
    ...(await getOzonHeaders()),
    "Content-Type": "application/json",
  };

  const body = JSON.stringify({
    dir: "desc",
    filter: { since: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
    limit: 100,
  });

  const data = await httpsPost(
    "api-seller.ozon.ru",
    "/v2/posting/fbo/list",
    ozonHeaders,
    body
  );

  const rows = (data?.result ?? []).flatMap((posting: any) =>
    (posting.products ?? []).map((p: any) => ({
      id: posting.posting_number,
      marketplace: "ozon" as const,
      time: posting.created_at,
      article: p.offer_id,
      name: p.name,
      price: parseFloat(p.price ?? "0"),
      qty: p.quantity ?? 1,
      status: posting.status,
      region: "",
      warehouse: "FBO",
    }))
  );

  return rows;
}

// ── YM ───────────────────────────────────────────────────────────────────────

// YM creationDate format: "30-05-2026 12:45:50" (Moscow time, UTC+3)
// Must use +03:00 suffix, not Z — otherwise browser shifts +3h forward
function parseYmDate(s: string): string {
  const m = s?.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}+03:00`;
  return new Date().toISOString();
}

async function fetchYmCampaignOrders(campaignId: string, from: string, to: string, type: "fby" | "fbs") {
  const params = new URLSearchParams({ limit: "50", fromDate: from, toDate: to });
  const data = await httpsGet(
    "api.partner.market.yandex.ru",
    `/v2/campaigns/${campaignId}/orders?${params}`,
    { "Api-Key": await getYmToken(), "Content-Type": "application/json" },
    ymAgent
  );

  return (data?.orders ?? []).flatMap((order: any) =>
    (order.items ?? []).map((item: any) => ({
      id: order.id,
      marketplace: "ym" as const,
      time: parseYmDate(order.creationDate),
      article: item.offerId,
      name: item.offerName ?? item.offerId,
      price: item.prices?.buyerPrice ?? item.price ?? 0,
      qty: item.count ?? 1,
      status: order.status?.toLowerCase() ?? "unknown",
      region: "",
      warehouse: type.toUpperCase(),
    }))
  );
}

async function fetchYmOrders(from: string, to: string) {
  const [FBY, FBS] = await getYmCampaignIds();
  const [fby, fbs] = await Promise.all([
    fetchYmCampaignOrders(FBY, from, to, "fby").catch(() => []),
    fetchYmCampaignOrders(FBS, from, to, "fbs").catch(() => []),
  ]);
  return [...fby, ...fbs];
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/orders-feed", async (req, res) => {
  const to = (req.query.to as string) || isoDate(new Date());
  const from = (req.query.from as string) || isoDate(new Date(Date.now() - 7 * 86400000));

  // WB sequential to avoid rate limit
  const wbOrders = await fetchWbOrders(from, to).catch(() => []);
  await sleep(300);

  const [ozonOrders, ymOrders] = await Promise.all([
    fetchOzonOrders(from, to).catch(() => []),
    fetchYmOrders(from, to).catch(() => []),
  ]);

  const all = [...wbOrders, ...ozonOrders, ...ymOrders]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const totals = {
    total: all.length,
    wb: wbOrders.length,
    ozon: ozonOrders.length,
    ym: ymOrders.length,
    revenue: all.filter(o => o.status !== "cancel").reduce((s, o) => s + o.price * o.qty, 0),
  };

  res.json({ from, to, orders: all, totals });
});

export default router;
