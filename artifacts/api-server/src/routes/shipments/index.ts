import { Router, type Request, type Response } from "express";
import * as https from "node:https";
import * as dns from "node:dns";
import { getWbToken, getOzonHeaders, getYmToken, getYmCampaignIds } from "../../lib/settings.js";

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

function lookup4(
  hostname: string,
  opts: dns.LookupOptions,
  cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
) {
  dns.lookup(hostname, { ...opts, family: 4 }, cb as any);
}
const ymAgent = new https.Agent({ lookup: lookup4 as any });

/** JSON request/response helper */
function httpsJson(
  method: string,
  hostname: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
  agent?: https.Agent
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const buf = body ? Buffer.from(body) : undefined;
    const h: Record<string, string> = { ...headers, Host: hostname };
    if (buf) h["Content-Length"] = String(buf.length);

    const req = https.request({ hostname, path, method, headers: h, agent }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on("error", reject);
    if (buf) req.write(buf);
    req.end();
  });
}

/** Binary (Buffer) response helper — for barcodes / labels */
function httpsBinary(
  method: string,
  hostname: string,
  path: string,
  headers: Record<string, string>,
  agent?: https.Agent
): Promise<{ status: number; contentType: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const h: Record<string, string> = { ...headers, Host: hostname };
    const req = https.request({ hostname, path, method, headers: h, agent }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          contentType: res.headers["content-type"] ?? "application/octet-stream",
          buffer: Buffer.concat(chunks),
        })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

// ── WB marketplace API ────────────────────────────────────────────────────────

const WB_MKT = "marketplace-api.wildberries.ru";

async function wbH() {
  return { Authorization: await getWbToken(), "Content-Type": "application/json" };
}

async function wbGet(path: string) {
  const r = await httpsJson("GET", WB_MKT, path, await wbH());
  if (r.status >= 400) throw new Error(`WB ${path} → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function wbPost(path: string, body: object = {}) {
  const r = await httpsJson("POST", WB_MKT, path, await wbH(), JSON.stringify(body));
  if (r.status >= 400) throw new Error(`WB POST ${path} → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function wbPut(path: string, body: object = {}) {
  const r = await httpsJson("PUT", WB_MKT, path, await wbH(), JSON.stringify(body));
  if (r.status >= 400) throw new Error(`WB PUT ${path} → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function wbDelete(path: string) {
  const r = await httpsJson("DELETE", WB_MKT, path, await wbH());
  if (r.status >= 400) throw new Error(`WB DELETE ${path} → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

// GET /api/shipments/wb/supplies
router.get("/shipments/wb/supplies", async (_req: Request, res: Response) => {
  const data = await wbGet("/api/v3/supplies?limit=50&next=0");
  res.json({
    supplies: (data?.supplies ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      done: s.done ?? false,
      createdAt: s.createdAt,
      closedAt: s.closedAt ?? null,
      scanDt: s.scanDt ?? null,
    })),
  });
});

// POST /api/shipments/wb/supplies — create supply
router.post("/shipments/wb/supplies", async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const data = await wbPost("/api/v3/supplies", { name: name.trim() });
  res.json({ id: data?.id });
});

// GET /api/shipments/wb/orders/new — FBO orders not yet in a supply
router.get("/shipments/wb/orders/new", async (_req: Request, res: Response) => {
  const data = await wbGet("/api/v3/orders/new");
  const orders: any[] = data?.orders ?? [];
  res.json({
    orders: orders.map((o: any) => ({
      id: o.id,
      article: o.article,
      createdAt: o.createdAt,
      warehouseId: o.warehouseId,
      skus: o.skus ?? [],
    })),
  });
});

// GET /api/shipments/wb/supplies/:supplyId/orders — orders in a specific supply
router.get("/shipments/wb/supplies/:supplyId/orders", async (req: Request, res: Response) => {
  const { supplyId } = req.params;
  const data = await wbGet(`/api/v3/supplies/${supplyId}/orders`);
  res.json({ orders: data?.orders ?? [] });
});

// PUT /api/shipments/wb/supplies/:supplyId/orders/:orderId — add order to supply
router.put("/shipments/wb/supplies/:supplyId/orders/:orderId", async (req: Request, res: Response) => {
  const { supplyId, orderId } = req.params;
  await wbPut(`/api/v3/supplies/${supplyId}/orders/${orderId}`);
  res.json({ ok: true });
});

// DELETE /api/shipments/wb/supplies/:supplyId/orders/:orderId — remove order from supply
router.delete("/shipments/wb/supplies/:supplyId/orders/:orderId", async (req: Request, res: Response) => {
  const { supplyId, orderId } = req.params;
  await wbDelete(`/api/v3/supplies/${supplyId}/orders/${orderId}`);
  res.json({ ok: true });
});

// POST /api/shipments/wb/supplies/:supplyId/deliver — close & deliver supply to WB
router.post("/shipments/wb/supplies/:supplyId/deliver", async (req: Request, res: Response) => {
  const { supplyId } = req.params;
  await wbPost(`/api/v3/supplies/${supplyId}/deliver`);
  res.json({ ok: true });
});

// GET /api/shipments/wb/supplies/:supplyId/barcode — proxy barcode binary (SVG/PNG)
router.get("/shipments/wb/supplies/:supplyId/barcode", async (req: Request, res: Response) => {
  const { supplyId } = req.params;
  const type = (req.query.type as string) || "png";
  const h = { Authorization: await getWbToken() };
  const r = await httpsBinary("GET", WB_MKT, `/api/v3/supplies/${supplyId}/barcode?type=${type}`, h);
  if (r.status >= 400) { res.status(r.status).json({ error: "barcode fetch failed" }); return; }
  res.setHeader("Content-Type", r.contentType || (type === "svg" ? "image/svg+xml" : "image/png"));
  res.setHeader("Content-Disposition", `attachment; filename="supply-${supplyId}.${type}"`);
  res.end(r.buffer);
});

// ── Ozon FBS ──────────────────────────────────────────────────────────────────

const OZON_BASE = "api-seller.ozon.ru";

async function ozonH() {
  return {
    ...(await getOzonHeaders()),
    "Content-Type": "application/json",
  };
}

async function ozonPost(path: string, body: object) {
  const r = await httpsJson("POST", OZON_BASE, path, await ozonH(), JSON.stringify(body));
  if (r.status >= 400) throw new Error(`Ozon ${path} → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

// GET /api/shipments/ozon/fbs — FBS postings requiring action
router.get("/shipments/ozon/fbs", async (_req: Request, res: Response) => {
  const statuses = ["awaiting_packaging", "awaiting_deliver", "arbitration"];
  const results: any[] = [];

  for (const status of statuses) {
    try {
      const data = await ozonPost("/v3/posting/fbs/list", {
        dir: "asc",
        filter: { status },
        limit: 50,
        offset: 0,
        with: { analytics_data: true, financial_data: false, barcodes: false, transactionality: false },
      });
      const postings: any[] = data?.result?.postings ?? [];
      results.push(
        ...postings.map((p: any) => ({
          postingNumber: p.posting_number,
          status: p.status,
          createdAt: p.created_at,
          shipmentDate: p.shipment_date ?? null,
          trackingNumber: p.tracking_number ?? null,
          products: (p.products ?? []).map((pr: any) => ({
            sku: pr.sku,
            offerId: pr.offer_id,
            name: pr.name,
            qty: pr.quantity,
            price: parseFloat(pr.price ?? "0"),
          })),
          addresseeCity: p.analytics_data?.city ?? "",
          warehouse: p.analytics_data?.warehouse_name ?? "",
          deliveryType: p.analytics_data?.delivery_type ?? "",
        }))
      );
    } catch { /* partial failure — continue */ }
  }

  results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  res.json({ postings: results });
});

// POST /api/shipments/ozon/fbs/:postingNumber/ship — confirm shipment
// Body: { products: [{ sku: number; qty: number }] }
router.post("/shipments/ozon/fbs/:postingNumber/ship", async (req: Request, res: Response) => {
  const { postingNumber } = req.params;
  const { products } = req.body as { products?: Array<{ sku: number; qty: number }> };
  if (!products || products.length === 0) {
    res.status(400).json({ error: "products required" });
    return;
  }
  const data = await ozonPost("/v3/posting/fbs/ship", {
    posting_number: postingNumber,
    packages: [
      {
        products: products.map((p) => ({ product_id: p.sku, quantity: p.qty })),
      },
    ],
  });
  res.json(data);
});

// GET /api/shipments/ozon/fbs/:postingNumber/label — posting label (PDF)
router.get("/shipments/ozon/fbs/:postingNumber/label", async (req: Request, res: Response) => {
  const { postingNumber } = req.params;
  // Ozon label endpoint returns PDF binary
  const h = {
    ...(await getOzonHeaders()),
    "Content-Type": "application/json",
  };
  const bodyBuf = Buffer.from(JSON.stringify({ posting_number: [postingNumber] }));
  const r = await new Promise<{ status: number; contentType: string; buffer: Buffer }>(
    (resolve, reject) => {
      const reqH: Record<string, string> = {
        ...h,
        Host: OZON_BASE,
        "Content-Length": String(bodyBuf.length),
      };
      const node = https.request(
        { hostname: OZON_BASE, path: "/v2/posting/fbs/package-label", method: "POST", headers: reqH },
        (resp) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c: Buffer) => chunks.push(c));
          resp.on("end", () =>
            resolve({
              status: resp.statusCode ?? 0,
              contentType: resp.headers["content-type"] ?? "application/pdf",
              buffer: Buffer.concat(chunks),
            })
          );
        }
      );
      node.on("error", reject);
      node.write(bodyBuf);
      node.end();
    }
  );

  if (r.status >= 400) {
    res.status(r.status).json({ error: "label fetch failed", raw: r.buffer.toString().slice(0, 200) });
    return;
  }
  res.setHeader("Content-Type", r.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="label-${postingNumber}.pdf"`);
  res.end(r.buffer);
});

// ── YM pending orders ─────────────────────────────────────────────────────────

const YM_HOST = "api.partner.market.yandex.ru";

async function ymH() {
  return { "Api-Key": await getYmToken(), "Content-Type": "application/json" };
}

async function ymReq(method: string, path: string, body?: object) {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const r = await httpsJson(method, YM_HOST, path, await ymH(), bodyStr, ymAgent);
  if (r.status >= 400) throw new Error(`YM ${method} ${path} → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

// FBY/FBS campaign IDs loaded dynamically from settings (see getYmCampaignIds())

const YM_STATUS_LABELS: Record<string, string> = {
  PROCESSING: "Обрабатывается",
  READY_TO_SHIP: "Готов к отгрузке",
  SHIPPED: "Отгружен",
  DELIVERY: "В доставке",
  PICKUP: "Ожидает выдачи",
  DELIVERED: "Доставлен",
  CANCELLED: "Отменён",
  CANCELLED_IN_DELIVERY: "Отм. в доставке",
  CANCELLED_BY_USER: "Отм. покупателем",
};

// GET /api/shipments/ym/pending
router.get("/shipments/ym/pending", async (_req: Request, res: Response) => {
  const allOrders: any[] = [];
  const statuses = ["PROCESSING", "READY_TO_SHIP", "SHIPPED"];
  const [FBY_CAMPAIGN, FBS_CAMPAIGN] = await getYmCampaignIds();

  for (const status of statuses) {
    for (const [campaignId, type] of [[FBS_CAMPAIGN, "FBS"], [FBY_CAMPAIGN, "FBY"]] as const) {
      try {
        const params = new URLSearchParams({ limit: "50", status });
        const data = await ymReq("GET", `/v2/campaigns/${campaignId}/orders?${params}`);
        allOrders.push(
          ...(data?.orders ?? []).map((o: any) => ({
            id: o.id,
            status: o.status,
            statusLabel: YM_STATUS_LABELS[o.status] ?? o.status,
            substatus: o.substatus ?? null,
            creationDate: o.creationDate,
            type,
            campaignId,
            buyerTotal: o.buyerTotal ?? 0,
            items: (o.items ?? []).map((item: any) => ({
              offerId: item.offerId,
              offerName: item.offerName ?? item.offerId,
              count: item.count ?? 1,
              price: item.prices?.buyerPrice ?? item.price ?? 0,
            })),
            delivery: o.delivery
              ? { type: o.delivery.type ?? "", serviceName: o.delivery.serviceName ?? "", dates: o.delivery.dates ?? null }
              : null,
          }))
        );
      } catch { /* continue */ }
    }
  }

  const seen = new Set<number>();
  const unique = allOrders.filter((o) => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
  unique.sort((a, b) => a.id - b.id);
  res.json({ orders: unique });
});

// POST /api/shipments/ym/fbs/:orderId/confirm — set FBS order status to READY_TO_SHIP
router.post("/shipments/ym/fbs/:orderId/confirm", async (req: Request, res: Response) => {
  const { orderId } = req.params;
  // Move order to PROCESSING → READY_TO_SHIP substatus
  const [, FBS_CAMPAIGN] = await getYmCampaignIds();
  const data = await ymReq("PUT", `/v2/campaigns/${FBS_CAMPAIGN}/orders/${orderId}/status`, {
    order: { status: "PROCESSING", substatus: "READY_TO_SHIP" },
  });
  res.json(data);
});

// GET /api/shipments/ym/fbs/:orderId/label — download shipment labels (PDF)
router.get("/shipments/ym/fbs/:orderId/label", async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const [, FBS_CAMPAIGN] = await getYmCampaignIds();
  const h = { ...(await ymH()), Host: YM_HOST };
  const r = await httpsBinary("GET", YM_HOST, `/v2/campaigns/${FBS_CAMPAIGN}/orders/${orderId}/delivery/labels`, h, ymAgent);
  if (r.status >= 400) { res.status(r.status).json({ error: "label fetch failed" }); return; }
  res.setHeader("Content-Type", r.contentType || "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="label-ym-${orderId}.pdf"`);
  res.end(r.buffer);
});

export default router;
